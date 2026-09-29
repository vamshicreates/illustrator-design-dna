# Adobe Illustrator Vector Design DNA (`illustrator-design-dna`)

**Cross-Platform (macOS & Windows) AI Agent Skill & MCP Server for Adobe Illustrator.**

Extract a designer's or company's **Vector Design DNA** from previous approved `.ai`, `.svg`, `.eps`, `.pdf`, or raster designs, and autonomously construct **100% editable, multi-layer native vector designs (`.ai` + `.svg` + `.png`) LIVE on screen in Adobe Illustrator** from a plain-text brief.

---

## Key Features

- **Deep Vector Design DNA Extraction**:
  - Opens `.ai`, `.eps`, and `.pdf` files in Adobe Illustrator to inspect artboard grids, layer hierarchy, document swatches, linear/radial gradient stop ramps, exact PostScript font names (`textRange.characterAttributes.textFont.name`), stroke weights, and vector path geometry.
  - Parses `.svg` files directly for `<linearGradient>`, `<radialGradient>`, `stroke-width` distributions, and `<text>` attributes.
- **Live Foreground Step-by-Step Execution (macOS & Windows)**:
  - Automatically brings Adobe Illustrator to the front (`osascript` on macOS, `WScript.Shell.AppActivate` on Windows).
  - Builds the artwork across **5 live foreground stages** with `app.redraw()` after every vector path, gradient, card, and text frame so the user watches the artboard draw itself live:
    1. `01_BACKGROUND` — Vector background rectangle, multi-stop linear/radial `GradientColor`, and geometric vector grid.
    2. `02_VECTOR_SHAPES` — Decorative concentric rings, glowing ellipses, polygons, stars, lines, and custom cubic Bezier paths (`pathPoints`).
    3. `03_CARDS_AND_ILLUSTRATION` — Bento vector cards with rounded corners, stroke outlines, and placed vector/raster brand assets.
    4. `04_TYPOGRAPHY` — Point text and area text frames with exact PostScript fonts, tracking, leading, and brand hex colors.
    5. `05_CTA_AND_BADGES` — Vector pill buttons, labels, and automatic export to native `.ai`, scalable `.svg`, and high-res `.png`.

---

## Quick Installation (macOS & Windows)

### Prompt 1 — Install Skill & MCP Server
Copy and paste this into your AI Agent (Antigravity / Claude Code / Cursor):

```text
Install the Adobe Illustrator Design DNA skill from https://github.com/vamshicreates/illustrator-design-dna into my global skills directory (~/.gemini/config/skills/illustrator-design-dna and ~/.agents/skills/illustrator-design-dna) and run `python3 scripts/setup_illustrator_mcp.py` so Adobe Illustrator is connected and ready.
```

### Prompt 2 — Extract Vector Design DNA + Build Live in Illustrator
```text
Use the illustrator-design-dna skill.
1. Analyze our previous approved brand designs in: /path/to/approved_ai_or_svg_folder to extract our Vector Design DNA.
2. Bring Adobe Illustrator to the front and build a new editable vector design LIVE on screen for this brief:
   - Format: 1080x1350 Vector Poster / Carousel Slide
   - Eyebrow: "VAMSHICREATES DESIGN SYSTEM"
   - Headline: "PRECISION VECTOR WORKFLOWS."
   - Subheadline: "100% live paths, native gradients, and editable typography built automatically."
   - CTA Button: "EXPLORE THE SYSTEM ->"
   - Save the editable .ai file and .svg export to /path/to/output/
```

---

## Repository Structure

```text
illustrator-design-dna/
├── SKILL.md                           # Agent instructions & vector_spec.json schema
├── README.md                          # Documentation & copy-paste prompts
├── LICENSE                            # MIT License
├── assets/
│   ├── inspect_ai_dna.jsx             # ExtendScript (.jsx) Vector Design DNA inspector
│   └── ai_vector_builder.jsx          # Live foreground step-by-step vector builder
└── scripts/
    ├── illustrator_cli.py             # Cross-platform (macOS + Windows) Illustrator bridge
    ├── extract_illustrator_dna.py     # Multi-file (.ai, .svg, .eps, .pdf, .png) DNA scanner
    ├── illustrator_mcp_server.py      # Zero-dependency JSON-RPC 2.0 MCP Server
    └── setup_illustrator_mcp.py       # Auto-installer for Antigravity, Claude, and Cursor
```

---

## What's New in v1.1.0 — Embedded Laya Decision Gate (`NandhaKishorM/laya`)

This skill now embeds **[Laya (`https://github.com/NandhaKishorM/laya`)](https://github.com/NandhaKishorM/laya)** via `scripts/laya_decision_gate.py` with a **Strict Complexity Gate**:

- **Basic Tasks → Direct Manual Execution (Laya Bypassed)**: Simple, explicit commands (*"draw a 200x200 circle at (100, 100)"*, *"change stroke width to 2pt"*, *"export artboard to SVG"*, *"set headline font to Arial-BoldMT"*) bypass Laya completely (`laya_called: false`) and run directly in Adobe Illustrator with zero model overhead.
- **Complex / Ambiguous Creative Briefs → Laya System-1 Router (`from laya import Router`)**: Only when a task requires multi-branch creative routing (`choice`, `score`, `noul`), `scripts/laya_decision_gate.py` invokes Laya's non-autoregressive `Router` in a single forward pass.
