#!/usr/bin/env python3
"""Generate the Flatland Tools marketplace banner SVG (manual re-bake tool).

Self-contained output: Silkscreen/JetBrains Mono/Public Sans woff2 subsets
(from docs/node_modules/@fontsource — run pnpm install first) and the pixel
FL icon are embedded as data URIs so the SVG renders identically everywhere
without network access.

    python3 tools/vscode/scripts/generate-marketplace-banner.py

The README/marketplace form is docs/marketplace/banner.png — vsce blocks SVG
images in marketplace READMEs, so after regenerating the SVG, re-bake the PNG:
render the SVG in Chromium at deviceScaleFactor 2 (e.g. Playwright screenshot
of a 1280x400 <img> on a #111418 page -> 2560x800), then compress with
`pngquant --quality=85-98 --speed 1 --strip` (the grain dither masks the
quantization; verify no banding in the ambient glows).
"""

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FONTS = ROOT / 'docs/node_modules/@fontsource'
ICON = ROOT / 'tools/vscode/icons/icon.png'
OUT = ROOT / 'tools/vscode/docs/marketplace/banner.svg'


def b64(p: Path) -> str:
    return base64.b64encode(p.read_bytes()).decode()


silkscreen = b64(FONTS / 'silkscreen/files/silkscreen-latin-700-normal.woff2')
jbm = b64(FONTS / 'jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2')
pubsans = b64(FONTS / 'public-sans/files/public-sans-latin-400-normal.woff2')
icon = b64(ICON)

W, H = 1280, 400
CELL = 3  # pixel-glyph cell size (7x7 grid = 21x21 px)

# gem palette — mirrored from BrandAsset.astro local tokens
GOLD = '#f1c45f'
FG = '#f5f6f9'
MUTED = '#b3b8c4'

# One gem per tool — gold stays reserved for the structural spine + wordmark
# accent, matching BrandAsset (gold lives in the spine, not the rail).
# Fields: (gem, bar/glyph hex, label hex = gem 60% + muted 40%, label, glyph)
TOOLS = [
    ('turquoize', '#6fd9d0', '#8acccb', 'SPRITE ATLAS', 'atlas'),
    ('diamond', '#6cb8ff', '#88b8e7', 'IMAGE ENCODER', 'encode'),
    ('amethyst', '#b88af7', '#b69ce3', 'NORMAL BAKER', 'normal'),
    ('salmon', '#ff8a6b', '#e19c8f', 'AUDIO', 'audio'),
    ('emerald', '#4cd1b1', '#75c7b9', 'ATLAS MERGE', 'merge'),
]

STRIPE_W = 204
STRIPE_STEP = 231  # last bar ends flush at x=1204 with the separator + chip
RAIL_X = 76
SEP_Y = 294
BAR_Y = 312
GLYPH_Y = 331
LABEL_BASE = 346


def cells_rects(cells, color, gx, gy):
    """cells: list of (row, col, opacity) -> pixel rects."""
    out = []
    for r, c, o in cells:
        out.append(
            f'<rect x="{gx + c * CELL}" y="{gy + r * CELL}" width="{CELL}" height="{CELL}" '
            f'fill="{color}" opacity="{o}"/>'
        )
    return '\n      '.join(out)


def glyph(kind, color, gx, gy):
    if kind == 'atlas':
        # four sprite frames; top-left "selected"
        parts = []
        for i, (r, c) in enumerate([(0, 0), (0, 4), (4, 0), (4, 4)]):
            o = 1.0 if i == 0 else 0.55
            parts.append(
                f'<rect x="{gx + c * CELL}" y="{gy + r * CELL}" width="{3 * CELL}" height="{3 * CELL}" '
                f'fill="{color}" opacity="{o}"/>'
            )
        return '\n      '.join(parts)
    if kind == 'encode':
        # original | split-slider | encoded (dithered) — the compare view
        parts = [
            f'<rect x="{gx}" y="{gy}" width="{3 * CELL}" height="{7 * CELL}" fill="{color}" opacity="0.9"/>',
            f'<rect x="{gx + 3 * CELL}" y="{gy}" width="{CELL}" height="{7 * CELL}" fill="{color}" opacity="1"/>',
        ]
        cells = [(r, c, 0.55) for r in range(7) for c in (4, 5, 6) if (r + c) % 2 == 0]
        parts.append(cells_rects(cells, color, gx, gy))
        return '\n      '.join(parts)
    if kind == 'normal':
        # pixel sphere lit from top-left — the normal-map ball
        rows = {0: (2, 4), 1: (1, 5), 2: (0, 6), 3: (0, 6), 4: (0, 6), 5: (1, 5), 6: (2, 4)}
        hi = {(1, 2), (1, 3), (2, 1), (2, 2)}
        lo = {(4, 5), (4, 6), (5, 4), (5, 5)}
        cells = []
        for r, (c0, c1) in rows.items():
            for c in range(c0, c1 + 1):
                o = 1.0 if (r, c) in hi else 0.3 if (r, c) in lo else 0.55
                cells.append((r, c, o))
        return cells_rects(cells, color, gx, gy)
    if kind == 'audio':
        # waveform bars
        heights = [3, 5, 7, 4, 6, 2, 5]
        parts = []
        for c, h in enumerate(heights):
            start = 3 - (h - 1) // 2
            o = 1.0 if h == 7 else 0.85 if h >= 5 else 0.7 if h >= 3 else 0.55
            parts.append(
                f'<rect x="{gx + c * CELL}" y="{gy + start * CELL}" width="{CELL}" height="{h * CELL}" '
                f'fill="{color}" opacity="{o}"/>'
            )
        return '\n      '.join(parts)
    if kind == 'merge':
        # two atlases converging; the overlap cell lights up
        return '\n      '.join(
            [
                f'<rect x="{gx}" y="{gy}" width="{4 * CELL}" height="{4 * CELL}" fill="{color}" opacity="0.5"/>',
                f'<rect x="{gx + 3 * CELL}" y="{gy + 3 * CELL}" width="{4 * CELL}" height="{4 * CELL}" fill="{color}" opacity="0.5"/>',
                f'<rect x="{gx + 3 * CELL}" y="{gy + 3 * CELL}" width="{CELL}" height="{CELL}" fill="{color}" opacity="1"/>',
            ]
        )
    raise ValueError(kind)


stripes = []
for i, (gem, hex_, label_hex, label, kind) in enumerate(TOOLS):
    x = RAIL_X + i * STRIPE_STEP
    stripes.append(f'''  <g role="listitem" aria-label="FL {label.title()}">
      <rect x="{x}" y="{BAR_Y}" width="{STRIPE_W}" height="3" rx="1.5" fill="url(#bar-{gem})" filter="url(#bar-glow)"/>
      {glyph(kind, hex_, x, GLYPH_Y)}
      <text x="{x + 7 * CELL + 11}" y="{LABEL_BASE}" class="rail-label" fill="{label_hex}">{label}</text>
    </g>''')

bar_grads = '\n    '.join(
    f'''<linearGradient id="bar-{gem}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{hex_}"/>
      <stop offset="1" stop-color="{hex_}" stop-opacity="0.45"/>
    </linearGradient>'''
    for gem, hex_, _, _, _ in TOOLS
)

svg = f'''<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flatland Tools: a tools suite for game and multimedia assets in VS Code. Sprite Atlas, Image Encoder, Normal Baker, Audio, Atlas Merge.">
  <title>Flatland Tools</title>
  <desc>Marketplace banner: the pixel-art FL mark with the flatland tools wordmark, and a gem signal rail naming each tool in the suite.</desc>

  <style>
    @font-face {{
      font-family: 'Silkscreen';
      font-weight: 700;
      src: url(data:font/woff2;base64,{silkscreen}) format('woff2');
    }}
    @font-face {{
      font-family: 'JetBrains Mono';
      font-weight: 600;
      src: url(data:font/woff2;base64,{jbm}) format('woff2');
    }}
    @font-face {{
      font-family: 'Public Sans';
      font-weight: 400;
      src: url(data:font/woff2;base64,{pubsans}) format('woff2');
    }}
    .eyebrow {{
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.16em;
    }}
    .wordmark {{
      font-family: 'Silkscreen', monospace;
      font-size: 64px;
      font-weight: 700;
      letter-spacing: -0.04em;
    }}
    .tagline {{
      font-family: 'Public Sans', system-ui, sans-serif;
      font-size: 20px;
      font-weight: 400;
      letter-spacing: -0.005em;
    }}
    .chip {{
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }}
    .rail-label {{
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.13em;
    }}
  </style>

  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0e1117"/>
      <stop offset="1" stop-color="#131722"/>
    </linearGradient>
    <radialGradient id="glow-amethyst" cx="0.8" cy="0.2" r="0.62">
      <stop offset="0" stop-color="#b88af7" stop-opacity="0.16"/>
      <stop offset="0.6" stop-color="#b88af7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow-emerald" cx="0.1" cy="0.9" r="0.7">
      <stop offset="0" stop-color="#4cd1b1" stop-opacity="0.12"/>
      <stop offset="0.65" stop-color="#4cd1b1" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="spine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{GOLD}" stop-opacity="0"/>
      <stop offset="0.1" stop-color="{GOLD}" stop-opacity="0.4"/>
      <stop offset="0.5" stop-color="{GOLD}" stop-opacity="1"/>
      <stop offset="0.9" stop-color="{GOLD}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="{GOLD}" stop-opacity="0"/>
    </linearGradient>
    {bar_grads}
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0"/>
    </filter>
    <filter id="spine-glow" x="-400%" y="-10%" width="900%" height="120%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
    <filter id="icon-glow" x="-40%" y="-40%" width="180%" height="200%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="{GOLD}" flood-opacity="0.28"/>
    </filter>
    <filter id="word-glow" x="-20%" y="-60%" width="140%" height="260%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="{GOLD}" flood-opacity="0.38"/>
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#b88af7" flood-opacity="0.22"/>
    </filter>
    <filter id="bar-glow" x="-10%" y="-300%" width="120%" height="700%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="soft"/>
      <feComponentTransfer in="soft" result="softdim">
        <feFuncA type="linear" slope="0.55"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="softdim"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="tally-glow" x="-300%" y="-50%" width="700%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="{GOLD}" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- substrate: near-black canvas, asymmetric ambient (amethyst upper-right,
       emerald counter-light lower-left; deliberately not a rainbow halo) -->
  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#glow-amethyst)"/>
  <rect width="{W}" height="{H}" fill="url(#glow-emerald)"/>
  <!-- sub-perceptual grain, 4% -->
  <rect width="{W}" height="{H}" filter="url(#grain)" opacity="0.04" style="mix-blend-mode: overlay"/>

  <!-- gold structural spine -->
  <rect x="-1" y="0" width="8" height="{H}" fill="url(#spine)" filter="url(#spine-glow)" opacity="0.5"/>
  <rect x="0" y="0" width="6" height="{H}" fill="url(#spine)"/>

  <!-- brand lockup: the locked pixel FL mark + flatland tools wordmark -->
  <image href="data:image/png;base64,{icon}" x="76" y="86" width="128" height="128"
         image-rendering="pixelated" style="image-rendering: pixelated" filter="url(#icon-glow)"/>

  <g>
    <rect x="244" y="92" width="3" height="14" fill="{GOLD}" filter="url(#tally-glow)"/>
    <text x="259" y="104" class="eyebrow" fill="#e4ca94">VS CODE TOOLS</text>
  </g>
  <text x="236" y="170" class="wordmark" fill="{FG}" filter="url(#word-glow)">flatland <tspan fill="{GOLD}">tools</tspan></text>
  <text x="244" y="204" class="tagline" fill="{MUTED}">A tools suite for game and multimedia assets that never leaves your editor.</text>

  <text x="1204" y="104" text-anchor="end" class="chip" fill="{GOLD}" opacity="0.92"># ext install three-flatland.tools</text>

  <!-- signal rail: one gem stripe per tool in the suite -->
  <line x1="{RAIL_X}" y1="{SEP_Y}" x2="1204" y2="{SEP_Y}" stroke="#ffffff" stroke-opacity="0.06"/>
  <g role="list" aria-label="The tools">
{chr(10).join(stripes)}
  </g>
</svg>
'''

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(svg)
print(f'wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)')
