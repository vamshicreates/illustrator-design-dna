#!/usr/bin/env python3
"""
Cross-platform (macOS & Windows) CLI bridge for Adobe Illustrator.
Brings Illustrator to the foreground and executes ExtendScript (.jsx) live on screen.
"""

import argparse
import glob
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
ASSETS_DIR = SKILL_ROOT / "assets"

ES3_JSON_POLYFILL = r"""
function __escStr(s) {
    return String(s)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
}
function __toJson(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return '"' + __escStr(v) + '"';
    if (v instanceof Array) {
        var arr = [];
        for (var i = 0; i < v.length; i++) arr.push(__toJson(v[i]));
        return "[" + arr.join(",") + "]";
    }
    if (t === "object") {
        var pairs = [];
        for (var k in v) {
            if (v.hasOwnProperty(k)) {
                pairs.push('"' + __escStr(k) + '":' + __toJson(v[k]));
            }
        }
        return "{" + pairs.join(",") + "}";
    }
    return "null";
}
"""


def find_illustrator_app() -> dict:
    """Locate Adobe Illustrator on macOS or Windows."""
    sys_name = platform.system()
    if sys_name == "Darwin":
        candidates = sorted(
            glob.glob("/Applications/Adobe Illustrator*/Adobe Illustrator.app"),
            reverse=True,
        )
        if candidates:
            app_path = candidates[0]
            return {
                "installed": True,
                "os": "macOS",
                "app_path": app_path,
                "app_name": Path(app_path).stem,
            }
        return {"installed": False, "os": "macOS", "app_path": None, "app_name": None}

    if sys_name == "Windows":
        search_patterns = [
            r"C:\Program Files\Adobe\Adobe Illustrator*\Support Files\Contents\Windows\Illustrator.exe",
            r"C:\Program Files\Adobe\Adobe Illustrator*\Illustrator.exe",
        ]
        for pat in search_patterns:
            matches = sorted(glob.glob(pat), reverse=True)
            if matches:
                return {
                    "installed": True,
                    "os": "Windows",
                    "app_path": matches[0],
                    "app_name": "Adobe Illustrator",
                }
        return {"installed": False, "os": "Windows", "app_path": None, "app_name": None}

    return {"installed": False, "os": sys_name, "app_path": None, "app_name": None}


def bring_illustrator_to_front(app_info: dict = None) -> None:
    """Bring Adobe Illustrator window to the foreground so the user watches live execution."""
    if app_info is None:
        app_info = find_illustrator_app()
    sys_name = platform.system()
    try:
        if sys_name == "Darwin" and app_info.get("app_path"):
            app_path = app_info["app_path"]
            script = f'tell application "{app_path}" to activate'
            subprocess.run(["osascript", "-e", script], capture_output=True, timeout=10)
        elif sys_name == "Windows":
            vbs = 'Set sh = CreateObject("WScript.Shell")\r\nsh.AppActivate "Adobe Illustrator"\r\n'
            with tempfile.NamedTemporaryFile("w", suffix=".vbs", delete=False, encoding="utf-8") as vf:
                vf.write(vbs)
                vbs_path = vf.name
            subprocess.run(["cscript", "//Nologo", vbs_path], capture_output=True, timeout=10)
            try:
                os.remove(vbs_path)
            except OSError:
                pass
    except Exception:
        pass


def execute_jsx_in_illustrator(jsx_body: str, timeout_sec: int = 120) -> dict:
    """Execute ExtendScript inside Adobe Illustrator in the foreground and return parsed JSON."""
    app_info = find_illustrator_app()
    if not app_info.get("installed"):
        return {
            "error": f"Adobe Illustrator was not found on {app_info.get('os')}. Please install Adobe Illustrator."
        }

    bring_illustrator_to_front(app_info)

    tmp_dir = Path(tempfile.gettempdir())
    stamp = f"{int(time.time() * 1000)}_{os.getpid()}"
    jsx_file = tmp_dir / f"ai_runner_{stamp}.jsx"
    out_file = tmp_dir / f"ai_result_{stamp}.json"
    out_posix = out_file.as_posix()

    wrapped_jsx = f"""{ES3_JSON_POLYFILL}
(function() {{
    var __res;
    try {{
        __res = (function() {{
{jsx_body}
        }})();
    }} catch (e) {{
        __res = {{ error: String(e), line: e.line }};
    }}
    try {{
        var f = new File("{out_posix}");
        f.encoding = "UTF-8";
        f.open("w");
        f.write(__toJson(__res));
        f.close();
    }} catch (eWrite) {{}}
    return __toJson(__res);
}})();
"""
    jsx_file.write_text(wrapped_jsx, encoding="utf-8")

    sys_name = platform.system()
    try:
        if sys_name == "Darwin":
            app_path = app_info["app_path"]
            applescript = f'''
tell application "{app_path}"
    activate
    do javascript file (POSIX file "{jsx_file.as_posix()}")
end tell
'''
            proc = subprocess.run(
                ["osascript", "-e", applescript],
                capture_output=True,
                text=True,
                timeout=timeout_sec,
            )
            if not out_file.exists() and proc.stdout.strip():
                try:
                    return json.loads(proc.stdout.strip())
                except Exception:
                    pass
        elif sys_name == "Windows":
            vbs_file = tmp_dir / f"ai_runner_{stamp}.vbs"
            jsx_win = str(jsx_file).replace('"', '""')
            vbs_code = f'''
On Error Resume Next
Dim app
Set app = CreateObject("Illustrator.Application")
If Err.Number = 0 Then
    Dim sh
    Set sh = CreateObject("WScript.Shell")
    sh.AppActivate "Adobe Illustrator"
    app.DoJavaScriptFile "{jsx_win}"
End If
'''
            vbs_file.write_text(vbs_code, encoding="utf-8")
            subprocess.run(["cscript", "//Nologo", str(vbs_file)], capture_output=True, text=True, timeout=timeout_sec)
            try:
                vbs_file.unlink()
            except OSError:
                pass

            if not out_file.exists() and app_info.get("app_path"):
                subprocess.run(
                    [app_info["app_path"], "-r", str(jsx_file)],
                    capture_output=True,
                    text=True,
                    timeout=timeout_sec,
                )

        # Wait briefly if file is flushing
        for _ in range(20):
            if out_file.exists() and out_file.stat().st_size > 0:
                break
            time.sleep(0.15)

        if out_file.exists():
            raw = out_file.read_text(encoding="utf-8", errors="replace").strip()
            if raw:
                return json.loads(raw)
        return {"error": "No JSON response returned from Adobe Illustrator."}
    except subprocess.TimeoutExpired:
        return {"error": f"Adobe Illustrator script execution timed out after {timeout_sec}s."}
    except Exception as exc:
        return {"error": str(exc)}
    finally:
        for f in (jsx_file, out_file):
            try:
                if f.exists():
                    f.unlink()
            except OSError:
                pass


def cmd_status(_args) -> int:
    info = find_illustrator_app()
    print(json.dumps(info, indent=2))
    return 0 if info.get("installed") else 1


def cmd_inspect_ai(args) -> int:
    inspect_jsx_path = ASSETS_DIR / "inspect_ai_dna.jsx"
    inspect_code = inspect_jsx_path.read_text(encoding="utf-8")
    file_arg = Path(args.file).resolve().as_posix() if args.file else ""
    preview_arg = Path(args.preview_png).resolve().as_posix() if args.preview_png else ""

    body = f"""
{inspect_code}
return inspectAiDocument("{file_arg}", "{preview_arg}");
"""
    res = execute_jsx_in_illustrator(body, timeout_sec=180)
    print(json.dumps(res, indent=2))
    return 0 if "error" not in res else 1


def cmd_build_from_spec(args) -> int:
    spec_path = Path(args.spec).resolve()
    if not spec_path.exists():
        print(json.dumps({"error": f"Spec file not found: {spec_path}"}))
        return 1

    spec_data = json.loads(spec_path.read_text(encoding="utf-8"))
    for key in ("output_ai", "output_svg", "output_png"):
        if spec_data.get(key):
            out_p = Path(spec_data[key]).resolve()
            out_p.parent.mkdir(parents=True, exist_ok=True)
            spec_data[key] = out_p.as_posix()

    builder_jsx_path = ASSETS_DIR / "ai_vector_builder.jsx"
    builder_code = builder_jsx_path.read_text(encoding="utf-8")
    spec_json_literal = json.dumps(spec_data)

    stages = [
        "stage_1_background",
        "stage_2_shapes",
        "stage_3_cards",
        "stage_4_typography",
        "stage_5_cta_and_export",
    ]

    stage_results = []
    final_result = {}
    for st in stages:
        body = f"""
{builder_code}
var __spec = {spec_json_literal};
return buildVectorFromSpec(__spec, "{st}");
"""
        res = execute_jsx_in_illustrator(body, timeout_sec=120)
        stage_results.append(res)
        if "error" in res:
            print(json.dumps({"error": res["error"], "failed_stage": st, "stages": stage_results}, indent=2))
            return 1
        final_result = res
        time.sleep(0.25)

    final_result["live_stages_completed"] = len(stages)
    print(json.dumps(final_result, indent=2))
    return 0


def cmd_execute_jsx(args) -> int:
    builder_jsx_path = ASSETS_DIR / "ai_vector_builder.jsx"
    builder_code = builder_jsx_path.read_text(encoding="utf-8") if builder_jsx_path.exists() else ""
    if args.file:
        user_code = Path(args.file).read_text(encoding="utf-8")
    else:
        user_code = args.code or ""

    body = f"""
{builder_code}
{user_code}
"""
    res = execute_jsx_in_illustrator(body, timeout_sec=120)
    print(json.dumps(res, indent=2))
    return 0 if "error" not in res else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Adobe Illustrator Live Vector CLI (macOS & Windows)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="Check Adobe Illustrator installation status")

    p_insp = sub.add_parser("inspect-ai", help="Extract Vector Design DNA from an .ai/.eps/.pdf/.svg file")
    p_insp.add_argument("--file", default="", help="Path to vector file (omit to inspect active document)")
    p_insp.add_argument("--preview-png", default="", help="Optional path to export artboard PNG preview")

    p_build = sub.add_parser("build-from-spec", help="Build a multi-layer vector design LIVE in Illustrator")
    p_build.add_argument("--spec", required=True, help="Path to vector_spec.json")

    p_exec = sub.add_parser("execute-jsx", help="Execute custom ExtendScript live inside Illustrator")
    p_exec.add_argument("--code", default="", help="Inline ExtendScript code")
    p_exec.add_argument("--file", default="", help="Path to .jsx file")

    args = parser.parse_args()
    if args.command == "status":
        return cmd_status(args)
    if args.command == "inspect-ai":
        return cmd_inspect_ai(args)
    if args.command == "build-from-spec":
        return cmd_build_from_spec(args)
    if args.command == "execute-jsx":
        return cmd_execute_jsx(args)
    return 1


if __name__ == "__main__":
    sys.exit(main())
