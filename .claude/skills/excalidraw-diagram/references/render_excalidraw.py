"""Render Excalidraw JSON to PNG using Playwright + headless Chromium.

Usage:
    cd .claude/skills/excalidraw-diagram/references
    uv run python render_excalidraw.py <path-to-file.excalidraw> [--output path.png] [--scale 2] [--width 1920]

First-time setup:
    cd .claude/skills/excalidraw-diagram/references
    uv sync
    uv run playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


DOCS_FONT_STACK = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
_EXCALIDRAW_FONT_RE = r"(?:Excalifont|Nunito|Comic Shanns|Cascadia|Virgil|Assistant|Helvetica)"


def rewrite_fonts(svg: str) -> str:
    """Repoint the exported SVG's text to the docs font (JetBrains Mono).

    Excalidraw lays text out in its own fonts and embeds them as @font-face
    data URLs, but those embedded fonts do NOT reliably load when the SVG is
    inlined into an HTML page — text then falls back to a wider system font and
    overflows the baked positions. The render template lays out in JetBrains
    Mono; this rewrites the SVG to also *reference* 'JetBrains Mono' (which docs
    pages already load via Fontsource), so display matches layout everywhere.
    """
    svg = re.sub(
        rf'font-family="{_EXCALIDRAW_FONT_RE}[^"]*"',
        f'font-family="{DOCS_FONT_STACK}"',
        svg,
    )
    svg = re.sub(
        rf"font-family:\s*{_EXCALIDRAW_FONT_RE}\b",
        "font-family: 'JetBrains Mono'",
        svg,
    )
    return svg


def validate_excalidraw(data: dict) -> list[str]:
    """Validate Excalidraw JSON structure. Returns list of errors (empty = valid)."""
    errors: list[str] = []

    if data.get("type") != "excalidraw":
        errors.append(f"Expected type 'excalidraw', got '{data.get('type')}'")

    if "elements" not in data:
        errors.append("Missing 'elements' array")
    elif not isinstance(data["elements"], list):
        errors.append("'elements' must be an array")
    elif len(data["elements"]) == 0:
        errors.append("'elements' array is empty — nothing to render")

    return errors


def compute_bounding_box(elements: list[dict]) -> tuple[float, float, float, float]:
    """Compute bounding box (min_x, min_y, max_x, max_y) across all elements."""
    min_x = float("inf")
    min_y = float("inf")
    max_x = float("-inf")
    max_y = float("-inf")

    for el in elements:
        if el.get("isDeleted"):
            continue
        x = el.get("x", 0)
        y = el.get("y", 0)
        w = el.get("width", 0)
        h = el.get("height", 0)

        # For arrows/lines, points array defines the shape relative to x,y
        if el.get("type") in ("arrow", "line") and "points" in el:
            for px, py in el["points"]:
                min_x = min(min_x, x + px)
                min_y = min(min_y, y + py)
                max_x = max(max_x, x + px)
                max_y = max(max_y, y + py)
        else:
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x + abs(w))
            max_y = max(max_y, y + abs(h))

    if min_x == float("inf"):
        return (0, 0, 800, 600)

    return (min_x, min_y, max_x, max_y)


def render(
    excalidraw_path: Path,
    output_path: Path | None = None,
    scale: int = 2,
    max_width: int = 1920,
    strict: bool = False,
) -> Path:
    """Render an .excalidraw file to PNG or SVG. Returns the output path.

    Always runs a geometric text-overflow lint and prints warnings; with
    ``strict`` it exits non-zero (3) when any text overflows its container.
    """
    # Import playwright here so validation errors show before import errors
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright not installed.", file=sys.stderr)
        print("Run: cd .claude/skills/excalidraw-diagram/references && uv sync && uv run playwright install chromium", file=sys.stderr)
        sys.exit(1)

    # Read and validate
    raw = excalidraw_path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in {excalidraw_path}: {e}", file=sys.stderr)
        sys.exit(1)

    errors = validate_excalidraw(data)
    if errors:
        print(f"ERROR: Invalid Excalidraw file:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    # Compute viewport size from element bounding box
    elements = [e for e in data["elements"] if not e.get("isDeleted")]
    min_x, min_y, max_x, max_y = compute_bounding_box(elements)
    padding = 80
    diagram_w = max_x - min_x + padding * 2
    diagram_h = max_y - min_y + padding * 2

    # Cap viewport width, let height be natural
    vp_width = min(int(diagram_w), max_width)
    vp_height = max(int(diagram_h), 600)

    # Output path
    if output_path is None:
        output_path = excalidraw_path.with_suffix(".png")

    # Text-overflow detector. For every text element BOUND to a container
    # (explicit containerId — so titles and free-floating labels are correctly
    # ignored), measure each line with the real Excalidraw font via canvas and
    # compare against the container's inner box. Catches the most common
    # authoring defect — a label wider/taller than the box it sits in — which
    # is easy to skim past by eye. Excalidraw measures bound text with the same
    # canvas measureText, so this matches what actually renders.
    OVERFLOW_JS = r"""
    async (elements) => {
      try { await document.fonts.ready; } catch (e) {}
      // Excalidraw fontFamily codes → CSS family. 1 hand-drawn, 2 normal, 3 code.
      const FAM = {
        1: 'Excalifont', 2: 'Nunito', 3: '"Comic Shanns", "Cascadia Code", monospace',
        5: 'Excalifont', 6: 'Nunito', 7: '"Comic Shanns", monospace', 8: 'Nunito',
      };
      const byId = new Map(elements.map((e) => [e.id, e]));
      const rects = elements.filter((e) => e.type === 'rectangle' && !e.isDeleted);
      const ctx = document.createElement('canvas').getContext('2d');
      // Comfort margin: Excalidraw's own bound-text padding is only 5px, which
      // lets text sit flush against the edge and read as cramped (and leaves no
      // slack for font-metric rounding). Demand ~8px of real breathing room.
      const PAD = 8;
      const SELF_TOL = 2; // px a glyph run may exceed its own declared box
      const out = [];
      for (const t of elements) {
        if (t.type !== 'text' || t.isDeleted) continue;
        const fs = t.fontSize || 16;
        ctx.font = `${fs}px ${FAM[t.fontFamily] || 'Excalifont'}, sans-serif`;
        const lineH = (t.lineHeight || 1.25) * fs;
        const lines = String(t.text != null ? t.text : (t.originalText || '')).split('\n');
        let maxW = 0;
        for (const ln of lines) { const w = ctx.measureText(ln).width; if (w > maxW) maxW = w; }
        const textH = lines.length * lineH;
        const footW = Math.max(maxW, t.width || 0);
        const footH = Math.max(textH, t.height || 0);
        const reasons = [];
        // (A) text renders wider/taller than its own declared box — its real
        // glyphs spill past the element bounds and get clipped at the export
        // edge (this is how free-floating, unbound labels overflow).
        if (Math.round(maxW - (t.width || 0)) > SELF_TOL) reasons.push(`text +${Math.round(maxW - (t.width || 0))}px past its own box width`);
        if (Math.round(textH - (t.height || 0)) > SELF_TOL) reasons.push(`text +${Math.round(textH - (t.height || 0))}px past its own box height`);
        // (B) bound text crowds its container — must keep PAD px of breathing
        // room on every side, never run flush to the edge.
        if (t.containerId) {
          const c = byId.get(t.containerId);
          if (c && !c.isDeleted) {
            const cx = Math.round(footW - (c.width - 2 * PAD));
            const cy = Math.round(footH - (c.height - 2 * PAD));
            if (cx > 0) reasons.push(`+${cx}px into the ${PAD}px container margin (horizontal)`);
            if (cy > 0) reasons.push(`+${cy}px into the ${PAD}px container margin (vertical)`);
          }
        } else {
          // (C) a FREE-floating label sitting inside a rectangle it is not
          // bound to: if its footprint spills past that box, it overflows the
          // box on the page (the box was sized for the label — bind it instead
          // of positioning it). Pick the tightest rectangle containing the
          // label's center that is larger than the label itself.
          const lcx = (t.x || 0) + footW / 2;
          const lcy = (t.y || 0) + footH / 2;
          let box = null;
          for (const r of rects) {
            if (lcx >= r.x && lcx <= r.x + r.width && lcy >= r.y && lcy <= r.y + r.height) {
              const area = r.width * r.height;
              if (area > footW * footH * 1.3 && (!box || area < box.area)) {
                box = { x: r.x, y: r.y, width: r.width, height: r.height, area };
              }
            }
          }
          if (box) {
            const overR = ((t.x || 0) + footW) - (box.x + box.width - PAD);
            const overL = (box.x + PAD) - (t.x || 0);
            const overB = ((t.y || 0) + footH) - (box.y + box.height - PAD);
            const overT = (box.y + PAD) - (t.y || 0);
            const ox = Math.round(Math.max(overR, overL));
            const oy = Math.round(Math.max(overB, overT));
            if (ox > 4) reasons.push(`free label +${ox}px outside the box it sits in (bind it)`);
            if (oy > 4) reasons.push(`free label +${oy}px outside the box it sits in vertically (bind it)`);
          }
        }
        if (reasons.length) {
          out.push({ text: String(t.text || '').replace(/\n/g, ' ').slice(0, 50), reasons });
        }
      }
      return out;
    }
    """

    # Template path (same directory as this script)
    template_path = Path(__file__).parent / "render_template.html"
    if not template_path.exists():
        print(f"ERROR: Template not found at {template_path}", file=sys.stderr)
        sys.exit(1)

    template_url = template_path.as_uri()

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:
            if "Executable doesn't exist" in str(e) or "browserType.launch" in str(e):
                print("ERROR: Chromium not installed for Playwright.", file=sys.stderr)
                print("Run: cd .claude/skills/excalidraw-diagram/references && uv run playwright install chromium", file=sys.stderr)
                sys.exit(1)
            raise

        page = browser.new_page(
            viewport={"width": vp_width, "height": vp_height},
            device_scale_factor=scale,
        )

        # Load the template
        page.goto(template_url)

        # Wait for the ES module to load (imports from esm.sh)
        page.wait_for_function("window.__moduleReady === true", timeout=30000)

        # Inject the diagram data and render
        json_str = json.dumps(data)
        result = page.evaluate(f"window.renderDiagram({json_str})")

        if not result or not result.get("success"):
            error_msg = result.get("error", "Unknown render error") if result else "renderDiagram returned null"
            print(f"ERROR: Render failed: {error_msg}", file=sys.stderr)
            browser.close()
            sys.exit(1)

        # Wait for render completion signal
        page.wait_for_function("window.__renderComplete === true", timeout=15000)

        # Locate the SVG element produced by exportToSvg
        svg_el = page.query_selector("#root svg")
        if svg_el is None:
            print("ERROR: No SVG element found after render.", file=sys.stderr)
            browser.close()
            sys.exit(1)

        # Overflow lint — text spilling outside its container is the most
        # common authoring defect and is easy to miss by eye.
        overflows = page.evaluate(OVERFLOW_JS, data["elements"])

        if output_path.suffix.lower() == ".svg":
            # Write the vector markup directly (embeddable in docs via ?raw)
            svg_markup = svg_el.evaluate("el => el.outerHTML")
            svg_markup = rewrite_fonts(svg_markup)
            output_path.write_text(svg_markup, encoding="utf-8")
        else:
            # Raster screenshot for visual validation
            svg_el.screenshot(path=str(output_path))
        browser.close()

    if overflows:
        print(
            f"⚠ TEXT OVERFLOW: {len(overflows)} text element(s) overflow or crowd their box:",
            file=sys.stderr,
        )
        for o in overflows:
            print(f"  - {o['text']!r}", file=sys.stderr)
            for reason in o["reasons"]:
                print(f"      {reason}", file=sys.stderr)
        print(
            "  Fix (in this order): split the label across lines, or shorten/truncate it with an ellipsis. "
            "Widening the box is a last resort — it bloats the diagram's width. Never run text flush to the edge.",
            file=sys.stderr,
        )
        if strict:
            sys.exit(3)

    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Render Excalidraw JSON to PNG or SVG")
    parser.add_argument("input", type=Path, help="Path to .excalidraw JSON file")
    parser.add_argument("--output", "-o", type=Path, default=None, help="Output path. Extension picks format (.png or .svg). Default: same name with .png")
    parser.add_argument("--svg", action="store_true", help="Emit SVG markup (embeddable). Equivalent to --output <name>.svg")
    parser.add_argument("--scale", "-s", type=int, default=2, help="Device scale factor for PNG (default: 2)")
    parser.add_argument("--width", "-w", type=int, default=1920, help="Max viewport width (default: 1920)")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero (3) if any text overflows its container")
    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    output = args.output
    if output is None and args.svg:
        output = args.input.with_suffix(".svg")

    out_path = render(args.input, output, args.scale, args.width, args.strict)
    print(str(out_path))


if __name__ == "__main__":
    main()
