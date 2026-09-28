#!/usr/bin/env python3
"""
One-command cross-platform installer for illustrator-design-dna (macOS & Windows).
Detects Adobe Illustrator and registers the MCP server in Antigravity / Claude / Cursor configs.
"""

import json
import os
import platform
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MCP_SERVER_SCRIPT = SCRIPT_DIR / "illustrator_mcp_server.py"

sys.path.insert(0, str(SCRIPT_DIR))
from illustrator_cli import find_illustrator_app  # noqa: E402


def get_mcp_config_paths() -> list:
    home = Path.home()
    paths = [
        home / ".gemini" / "antigravity" / "mcp_config.json",
        home / ".gemini" / "settings.json",
        home / ".cursor" / "mcp.json",
    ]
    if platform.system() == "Darwin":
        paths.append(
            home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
        )
    elif platform.system() == "Windows":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            paths.append(Path(appdata) / "Claude" / "claude_desktop_config.json")
    return paths


def register_mcp_server() -> list:
    updated = []
    entry = {
        "command": sys.executable,
        "args": [str(MCP_SERVER_SCRIPT)],
    }
    for cfg_path in get_mcp_config_paths():
        if not cfg_path.parent.exists():
            continue
        data = {}
        if cfg_path.exists():
            try:
                data = json.loads(cfg_path.read_text(encoding="utf-8"))
            except Exception:
                data = {}
        if "mcpServers" not in data or not isinstance(data["mcpServers"], dict):
            data["mcpServers"] = {}
        data["mcpServers"]["illustrator-design-dna"] = entry
        try:
            cfg_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            updated.append(str(cfg_path))
        except Exception:
            pass
    return updated


def main() -> int:
    app_info = find_illustrator_app()
    updated_configs = register_mcp_server()
    result = {
        "status": "ready",
        "illustrator": app_info,
        "mcp_server": str(MCP_SERVER_SCRIPT),
        "updated_configs": updated_configs,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
