#!/usr/bin/env python3
"""
Extract Vector Design DNA from a folder or file of previous approved designs
(.ai, .svg, .eps, .pdf, .png, .jpg, .webp) across macOS and Windows.
"""

import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
CLI_SCRIPT = SCRIPT_DIR / "illustrator_cli.py"

HEX_RE = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")


def normalize_hex(h: str) -> str:
    h = h.upper()
    if len(h) == 4:
        return "#" + h[1] * 2 + h[2] * 2 + h[3] * 2
    return h


def parse_svg_dna(svg_path: Path) -> dict:
    """Directly parse an .svg file for vector primitives, gradients, strokes, and fonts."""
    info = {
        "file": str(svg_path),
        "type": "svg",
        "width": None,
        "height": None,
        "viewBox": None,
        "groups": [],
        "colors": [],
        "stroke_weights": [],
        "fonts": [],
        "gradients": [],
        "element_counts": {},
    }
    try:
        raw_text = svg_path.read_text(encoding="utf-8", errors="replace")
        hexes = [normalize_hex(m) for m in HEX_RE.findall(raw_text)]
        info["colors"] = [c for c, _ in collections.Counter(hexes).most_common(20)]

        root = ET.fromstring(raw_text)
        info["width"] = root.attrib.get("width")
        info["height"] = root.attrib.get("height")
        info["viewBox"] = root.attrib.get("viewBox")

        counts = collections.Counter()
        strokes = set()
        fonts = set()

        for elem in root.iter():
            tag = elem.tag.split("}")[-1]
            counts[tag] += 1
            if tag == "g" and elem.attrib.get("id"):
                info["groups"].append(elem.attrib["id"])
            sw = elem.attrib.get("stroke-width")
            if sw:
                try:
                    strokes.add(round(float(re.sub(r"[^0-9.]", "", sw)), 2))
                except ValueError:
                    pass
            ff = elem.attrib.get("font-family")
            if ff:
                fonts.add(ff.strip("'\" "))
            style = elem.attrib.get("style", "")
            if "font-family" in style:
                m = re.search(r"font-family\s*:\s*([^;]+)", style)
                if m:
                    fonts.add(m.group(1).strip("'\" "))

            if tag in ("linearGradient", "radialGradient"):
                stops = []
                for child in elem:
                    ctag = child.tag.split("}")[-1]
                    if ctag == "stop":
                        sc = child.attrib.get("stop-color", "")
                        st_style = child.attrib.get("style", "")
                        if not sc and "stop-color" in st_style:
                            sm = re.search(r"stop-color\s*:\s*(#[0-9a-fA-F]{3,6})", st_style)
                            if sm:
                                sc = sm.group(1)
                        stops.append({
                            "offset": child.attrib.get("offset", ""),
                            "color": normalize_hex(sc) if sc.startswith("#") else sc,
                        })
                info["gradients"].append({
                    "id": elem.attrib.get("id", ""),
                    "type": tag,
                    "stops": stops,
                })

        info["element_counts"] = dict(counts)
        info["stroke_weights"] = sorted(strokes)
        info["fonts"] = sorted(fonts)
    except Exception as exc:
        info["parse_error"] = str(exc)
    return info


def analyze_raster_reference(img_path: Path, previews_dir: Path) -> dict:
    """Extract dimensions and dominant color swatches from a raster reference (.png/.jpg)."""
    preview_dest = previews_dir / img_path.name
    if img_path.resolve() != preview_dest.resolve():
        shutil.copy2(img_path, preview_dest)

    res = {
        "file": str(img_path),
        "type": "raster_reference",
        "preview_png": str(preview_dest),
        "width": None,
        "height": None,
        "dominant_colors": [],
    }
    try:
        from PIL import Image

        with Image.open(img_path) as im:
            res["width"], res["height"] = im.size
            small = im.convert("RGB").resize((120, 120))
            quant = small.quantize(colors=10)
            palette = quant.getpalette()
            color_counts = sorted(quant.getcolors(), reverse=True)
            dom = []
            for count, idx in color_counts[:8]:
                r, g, b = palette[idx * 3 : idx * 3 + 3]
                dom.append(f"#{r:02X}{g:02X}{b:02X}")
            res["dominant_colors"] = dom
    except Exception:
        pass
    return res


def inspect_via_illustrator(vec_path: Path, previews_dir: Path) -> dict:
    """Inspect .ai / .eps / .pdf file inside Adobe Illustrator and export a PNG preview."""
    preview_png = previews_dir / f"{vec_path.stem}_preview.png"
    proc = subprocess.run(
        [
            sys.executable,
            str(CLI_SCRIPT),
            "inspect-ai",
            "--file",
            str(vec_path.resolve()),
            "--preview-png",
            str(preview_png.resolve()),
        ],
        capture_output=True,
        text=True,
        timeout=200,
    )
    try:
        data = json.loads(proc.stdout.strip())
        data["file"] = str(vec_path)
        return data
    except Exception:
        return {
            "file": str(vec_path),
            "error": proc.stderr.strip() or proc.stdout.strip() or "Failed to inspect in Illustrator",
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract Vector Design DNA from approved Illustrator/SVG/image files")
    parser.add_argument("--source", required=True, help="Directory or file path of approved designs")
    parser.add_argument("--state-dir", default=".illustrator-dna", help="Directory to store extracted DNA state")
    args = parser.parse_args()

    source_path = Path(args.source).resolve()
    state_dir = Path(args.state_dir).resolve()
    previews_dir = state_dir / "previews"
    previews_dir.mkdir(parents=True, exist_ok=True)

    vector_exts = {".ai", ".eps", ".pdf"}
    svg_exts = {".svg"}
    raster_exts = {".png", ".jpg", ".jpeg", ".webp"}

    files = []
    if source_path.is_file():
        files = [source_path]
    elif source_path.is_dir():
        for p in sorted(source_path.rglob("*")):
            if p.is_file() and p.suffix.lower() in (vector_exts | svg_exts | raster_exts):
                files.append(p)

    if not files:
        print(json.dumps({"error": f"No supported design files found in {source_path}"}))
        return 1

    scanned_items = []
    all_colors = collections.Counter()
    all_fonts = collections.Counter()
    all_strokes = set()

    for f in files:
        ext = f.suffix.lower()
        if ext in svg_exts:
            svg_data = parse_svg_dna(f)
            scanned_items.append(svg_data)
            for c in svg_data.get("colors", []):
                all_colors[c] += 1
            for fn in svg_data.get("fonts", []):
                all_fonts[fn] += 1
            for sw in svg_data.get("stroke_weights", []):
                all_strokes.add(sw)
        elif ext in vector_exts:
            ai_data = inspect_via_illustrator(f, previews_dir)
            scanned_items.append(ai_data)
            for sw in ai_data.get("swatches", []):
                if sw.get("hex"):
                    all_colors[sw["hex"]] += 1
            vp = ai_data.get("vector_paths_summary", {})
            for fc in vp.get("fill_colors", []):
                all_colors[fc] += 1
            for sc in vp.get("stroke_colors", []):
                all_colors[sc] += 1
            for w in vp.get("stroke_weights_pt", []):
                all_strokes.add(w)
            for tf in ai_data.get("typography", []):
                if tf.get("font_postscript"):
                    all_fonts[tf["font_postscript"]] += 1
                if tf.get("color_hex"):
                    all_colors[tf["color_hex"]] += 1
        elif ext in raster_exts:
            r_data = analyze_raster_reference(f, previews_dir)
            scanned_items.append(r_data)
            for c in r_data.get("dominant_colors", []):
                all_colors[c] += 1

    summary = {
        "source": str(source_path),
        "total_files_scanned": len(scanned_items),
        "aggregated_dna": {
            "top_hex_palette": [c for c, _ in all_colors.most_common(16)],
            "top_fonts_postscript": [f for f, _ in all_fonts.most_common(10)],
            "stroke_weights_pt": sorted(all_strokes),
        },
        "files": scanned_items,
    }

    out_json = state_dir / "raw_vector_scan.json"
    out_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({"status": "success", "raw_scan_path": str(out_json), "summary": summary["aggregated_dna"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
