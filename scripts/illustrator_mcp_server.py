#!/usr/bin/env python3
"""
Model Context Protocol (MCP) stdio server for Adobe Illustrator Vector Design DNA.
Exposes tools for inspecting .ai/.svg documents, extracting Vector Design DNA, and building
multi-layer editable vector designs LIVE on screen on macOS and Windows.
"""

import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
CLI_SCRIPT = SCRIPT_DIR / "illustrator_cli.py"
EXTRACT_SCRIPT = SCRIPT_DIR / "extract_illustrator_dna.py"

from laya_decision_gate import evaluate_decision as _laya_eval  # noqa: E402

TOOLS = [
    {'name': 'illustrator_laya_decide', 'description': 'Evaluate a creative brief or decision for Adobe Illustrator using the embedded Laya model (https://github.com/NandhaKishorM/laya) with strict complexity gating. CALL ONLY WHEN NECESSARY for complex/ambiguous multi-branch tasks; for basic tasks, execute directly without calling Laya.', 'inputSchema': {'type': 'object', 'properties': {'state': {'type': 'string', 'description': 'The complex user brief or decision state to evaluate.'}, 'force_laya': {'type': 'boolean', 'description': 'Optional override to force Laya Router evaluation (default: false).'}}, 'required': ['state']}},
    {
        "name": "illustrator_status",
        "description": "Check Adobe Illustrator installation and live connection status on macOS or Windows.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "illustrator_inspect_ai",
        "description": "Extract full Vector Design DNA (artboards, layers, swatches, gradients, PostScript fonts, stroke weights, and vector paths) from an .ai/.eps/.pdf/.svg file or active Illustrator document.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Optional path to an .ai, .eps, .pdf, or .svg file. Omit to inspect the active document.",
                },
                "preview_png": {
                    "type": "string",
                    "description": "Optional output path to export an artboard PNG preview.",
                },
            },
        },
    },
    {
        "name": "illustrator_extract_design_dna",
        "description": "Scan a directory or file of previous approved vector/brand designs (.ai, .svg, .eps, .pdf, .png, .jpg) and save the extracted Vector Design DNA to .illustrator-dna/raw_vector_scan.json.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "source_dir": {
                    "type": "string",
                    "description": "Directory or file path of previous approved designs.",
                },
                "state_dir": {
                    "type": "string",
                    "description": "Directory to store extracted DNA state (default: .illustrator-dna).",
                },
            },
            "required": ["source_dir"],
        },
    },
    {
        "name": "illustrator_build_from_spec",
        "description": "Build a complete, multi-layer editable vector design (.ai + .svg + .png) LIVE in the foreground in Adobe Illustrator from a declarative vector_spec.json file.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "spec_json_path": {
                    "type": "string",
                    "description": "Path to vector_spec.json.",
                }
            },
            "required": ["spec_json_path"],
        },
    },
    {
        "name": "illustrator_execute_jsx",
        "description": "Execute custom ExtendScript (.jsx) live inside Adobe Illustrator with all ai_vector_builder.jsx helpers pre-loaded.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "ExtendScript (.jsx) code to execute inside Adobe Illustrator.",
                }
            },
            "required": ["code"],
        },
    },
]


def run_cmd(cmd: list, timeout: int = 240) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return proc.stdout.strip() or proc.stderr.strip()


def handle_call_tool(name: str, args: dict) -> dict:
    try:
        if name == "illustrator_laya_decide":
            res = _laya_eval(
                state_text=args.get("state", ""),
                force_laya=bool(args.get("force_laya", False)),
            )
            return {"content": [{"type": "text", "text": json.dumps(res, indent=2)}]}
        if name == "illustrator_status":
            out = run_cmd([sys.executable, str(CLI_SCRIPT), "status"])
        elif name == "illustrator_inspect_ai":
            cmd = [sys.executable, str(CLI_SCRIPT), "inspect-ai"]
            if args.get("file_path"):
                cmd += ["--file", args["file_path"]]
            if args.get("preview_png"):
                cmd += ["--preview-png", args["preview_png"]]
            out = run_cmd(cmd)
        elif name == "illustrator_extract_design_dna":
            cmd = [
                sys.executable,
                str(EXTRACT_SCRIPT),
                "--source",
                args["source_dir"],
                "--state-dir",
                args.get("state_dir", ".illustrator-dna"),
            ]
            out = run_cmd(cmd)
        elif name == "illustrator_build_from_spec":
            out = run_cmd(
                [sys.executable, str(CLI_SCRIPT), "build-from-spec", "--spec", args["spec_json_path"]]
            )
        elif name == "illustrator_execute_jsx":
            out = run_cmd([sys.executable, str(CLI_SCRIPT), "execute-jsx", "--code", args["code"]])
        else:
            return {"isError": True, "content": [{"type": "text", "text": f"Unknown tool: {name}"}]}

        return {"content": [{"type": "text", "text": out}]}
    except Exception as exc:
        return {"isError": True, "content": [{"type": "text", "text": str(exc)}]}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        if method == "initialize":
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "illustrator-design-dna", "version": "1.1.0"},
                },
            }
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            resp = {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}
        elif method == "tools/call":
            result = handle_call_tool(params.get("name", ""), params.get("arguments", {}))
            resp = {"jsonrpc": "2.0", "id": req_id, "result": result}
        else:
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }

        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
