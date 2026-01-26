#!/usr/bin/env python3
"""
Generate dithering patterns and textures for the retro pixel art theme.
Outputs CSS custom properties with compact SVG data URIs.

4x scaled Bayer patterns create visible "pixel blocks" for authentic SNES feel.
"""

from typing import List

# SNES Jehkoba32-inspired palette
PALETTE = {
    'white': '#f0edd8',
    'black': '#00021c',
    'pink': '#d94c87',
    'dark_pink': '#8a2f55',
    'purple': '#732866',
    'dark_purple': '#3d1b47',
    'deep_purple': '#1e0f2e',
    'cyan': '#47cca9',
    'dark_cyan': '#1b6b5a',
    'blue': '#0bafe6',
    'dark_blue': '#0a5580',
    'yellow': '#f2d24b',
    'dark_yellow': '#a8912e',
    'orange': '#e87d3e',
    'dark_orange': '#9c4a20',
    'green': '#5db858',
    'red': '#c93038',
    'navy': '#0a0b24',
    'midnight': '#050618',
}

# Bayer 4x4 matrix (values 0-15)
BAYER_4x4 = [
    [0,  8,  2,  10],
    [12, 4,  14, 6],
    [3,  11, 1,  9],
    [15, 7,  13, 5],
]

# Scale factor - each logical pixel becomes a 4x4 block
SCALE = 4
# Output pattern is 16x16 (4x4 matrix * 4 scale)
PATTERN_SIZE = 4 * SCALE


def generate_bayer_svg_4x(color: str, threshold: int = 8) -> str:
    """Generate a 4x scaled 16x16 Bayer dither SVG with 4x4 pixel blocks."""
    pixels = []
    for y, row in enumerate(BAYER_4x4):
        for x, val in enumerate(row):
            if val < threshold:
                # Each logical pixel is a 4x4 block
                bx, by = x * SCALE, y * SCALE
                pixels.append(f'<rect x="{bx}" y="{by}" width="{SCALE}" height="{SCALE}" fill="{color}"/>')

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{PATTERN_SIZE}" height="{PATTERN_SIZE}">{"".join(pixels)}</svg>'
    return svg_to_uri(svg)


def generate_scanlines_svg_4x(color: str, opacity: float = 0.1) -> str:
    """Generate 4x scaled scanlines SVG (8px total height, 4px visible line)."""
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="8"><rect width="1" height="4" fill="{color}" opacity="{opacity}"/></svg>'
    return svg_to_uri(svg)


def generate_checker_svg_4x(color: str) -> str:
    """Generate a 4x scaled 8x8 checkerboard with 4x4 squares."""
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect x="0" y="0" width="4" height="4" fill="{color}"/><rect x="4" y="4" width="4" height="4" fill="{color}"/></svg>'
    return svg_to_uri(svg)


def generate_dots_svg_4x(color: str, spacing: int = 4) -> str:
    """Generate a 4x scaled dot grid pattern with 4px radius dots."""
    size = spacing * SCALE
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}"><circle cx="2" cy="2" r="2" fill="{color}"/></svg>'
    return svg_to_uri(svg)


def generate_crosshatch_svg_4x(color: str) -> str:
    """Generate 4x scaled crosshatch pattern (32x32)."""
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M0,0 L32,32 M32,0 L0,32" stroke="{color}" stroke-width="4"/></svg>'
    return svg_to_uri(svg)


def generate_bayer_horizontal_gradient_svg(color: str, width_cells: int = 60, solid_cells: int = 40) -> str:
    """
    Generate a horizontal Bayer dither gradient SVG.
    Creates a gradient that starts solid, then fades to transparent using Bayer dithering.
    Uses proper 4x4 Bayer matrix thresholds for each column.

    width_cells: total number of 4x4 Bayer cells horizontally (each cell is 16px wide at 4x scale)
    solid_cells: number of cells that are fully solid before the dither fade begins
    Default 60 cells = 960px wide, with 40 solid cells (640px solid) + 20 cells dither fade (320px)
    """
    pixels = []
    pattern_width = width_cells * 4 * SCALE  # Total width in pixels
    pattern_height = 4 * SCALE  # Height is one Bayer cell (16px)

    fade_cells = width_cells - solid_cells  # Cells used for the dither fade

    for cell_x in range(width_cells):
        if cell_x < solid_cells:
            # Solid region - full threshold
            threshold = 16
        else:
            # Dither fade region
            fade_progress = (cell_x - solid_cells) / (fade_cells - 1) if fade_cells > 1 else 0
            threshold = int(16 * (1 - fade_progress))

        for y, row in enumerate(BAYER_4x4):
            for x, val in enumerate(row):
                if val < threshold:
                    # Position within the full pattern
                    px = (cell_x * 4 + x) * SCALE
                    py = y * SCALE
                    pixels.append(f'<rect x="{px}" y="{py}" width="{SCALE}" height="{SCALE}" fill="{color}"/>')

    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{pattern_width}" height="{pattern_height}">{"".join(pixels)}</svg>'
    return svg_to_uri(svg)


def svg_to_uri(svg: str) -> str:
    """Convert SVG to URL-encoded data URI."""
    encoded = svg.replace('"', "'").replace('#', '%23').replace('<', '%3C').replace('>', '%3E').replace(' ', '%20')
    return f'url("data:image/svg+xml,{encoded}")'


def generate_stepped_gradient(colors: List[str], direction: str = "to bottom") -> str:
    """Generate CSS stepped gradient."""
    num = len(colors)
    step = 100 / num
    stops = []
    for i, c in enumerate(colors):
        stops.append(f"{c} {i*step}% {(i+1)*step}%")
    return f"linear-gradient({direction}, {', '.join(stops)})"


def main():
    print("/* =============================================================================")
    print("   GENERATED RETRO PATTERNS - 4x Scaled for Visible Pixels")
    print("   Run: python3 scripts/generate-patterns.py > src/styles/patterns.css")
    print("   ============================================================================= */")
    print()
    print(":root {")

    # -------------------------------------------------------------------------
    # DARK MODE DITHER PATTERNS (colored pixels on transparent)
    # -------------------------------------------------------------------------
    print("  /* ==========================================================================")
    print("     DARK MODE DITHER PATTERNS")
    print("     4x scaled (16x16px tiles with 4x4 pixel blocks)")
    print("     Use background-size: 16px 16px for crisp pixels")
    print("     ========================================================================== */")
    print()

    # Cyan dithers
    print("  /* Cyan - for accents and highlights */")
    print(f"  --dither-cyan-12: {generate_bayer_svg_4x(PALETTE['cyan'], 2)};")
    print(f"  --dither-cyan-25: {generate_bayer_svg_4x(PALETTE['cyan'], 4)};")
    print(f"  --dither-cyan-37: {generate_bayer_svg_4x(PALETTE['cyan'], 6)};")
    print(f"  --dither-cyan-50: {generate_bayer_svg_4x(PALETTE['cyan'], 8)};")
    print(f"  --dither-cyan-62: {generate_bayer_svg_4x(PALETTE['cyan'], 10)};")
    print(f"  --dither-cyan-75: {generate_bayer_svg_4x(PALETTE['cyan'], 12)};")
    print(f"  --dither-cyan-87: {generate_bayer_svg_4x(PALETTE['cyan'], 14)};")
    print()

    # Pink dithers
    print("  /* Pink - for interactive elements */")
    print(f"  --dither-pink-12: {generate_bayer_svg_4x(PALETTE['pink'], 2)};")
    print(f"  --dither-pink-25: {generate_bayer_svg_4x(PALETTE['pink'], 4)};")
    print(f"  --dither-pink-37: {generate_bayer_svg_4x(PALETTE['pink'], 6)};")
    print(f"  --dither-pink-50: {generate_bayer_svg_4x(PALETTE['pink'], 8)};")
    print(f"  --dither-pink-62: {generate_bayer_svg_4x(PALETTE['pink'], 10)};")
    print(f"  --dither-pink-75: {generate_bayer_svg_4x(PALETTE['pink'], 12)};")
    print(f"  --dither-pink-87: {generate_bayer_svg_4x(PALETTE['pink'], 14)};")
    print()

    # Purple dithers
    print("  /* Purple - for sidebars and zones */")
    print(f"  --dither-purple-12: {generate_bayer_svg_4x(PALETTE['purple'], 2)};")
    print(f"  --dither-purple-25: {generate_bayer_svg_4x(PALETTE['purple'], 4)};")
    print(f"  --dither-purple-37: {generate_bayer_svg_4x(PALETTE['purple'], 6)};")
    print(f"  --dither-purple-50: {generate_bayer_svg_4x(PALETTE['purple'], 8)};")
    print(f"  --dither-purple-62: {generate_bayer_svg_4x(PALETTE['purple'], 10)};")
    print(f"  --dither-purple-75: {generate_bayer_svg_4x(PALETTE['purple'], 12)};")
    print(f"  --dither-purple-87: {generate_bayer_svg_4x(PALETTE['purple'], 14)};")
    print()

    # Blue dithers
    print("  /* Blue - for info elements */")
    print(f"  --dither-blue-12: {generate_bayer_svg_4x(PALETTE['blue'], 2)};")
    print(f"  --dither-blue-25: {generate_bayer_svg_4x(PALETTE['blue'], 4)};")
    print(f"  --dither-blue-50: {generate_bayer_svg_4x(PALETTE['blue'], 8)};")
    print(f"  --dither-blue-75: {generate_bayer_svg_4x(PALETTE['blue'], 12)};")
    print()

    # Orange dithers
    print("  /* Orange - for warnings */")
    print(f"  --dither-orange-12: {generate_bayer_svg_4x(PALETTE['orange'], 2)};")
    print(f"  --dither-orange-25: {generate_bayer_svg_4x(PALETTE['orange'], 4)};")
    print(f"  --dither-orange-50: {generate_bayer_svg_4x(PALETTE['orange'], 8)};")
    print(f"  --dither-orange-75: {generate_bayer_svg_4x(PALETTE['orange'], 12)};")
    print()

    # Yellow dithers
    print("  /* Yellow - for tips and highlights */")
    print(f"  --dither-yellow-12: {generate_bayer_svg_4x(PALETTE['yellow'], 2)};")
    print(f"  --dither-yellow-25: {generate_bayer_svg_4x(PALETTE['yellow'], 4)};")
    print(f"  --dither-yellow-50: {generate_bayer_svg_4x(PALETTE['yellow'], 8)};")
    print(f"  --dither-yellow-75: {generate_bayer_svg_4x(PALETTE['yellow'], 12)};")
    print()

    # Dark dithers (for overlays on light areas)
    print("  /* Dark colors - for shadows and overlays */")
    print(f"  --dither-dark-12: {generate_bayer_svg_4x(PALETTE['dark_purple'], 2)};")
    print(f"  --dither-dark-25: {generate_bayer_svg_4x(PALETTE['dark_purple'], 4)};")
    print(f"  --dither-dark-50: {generate_bayer_svg_4x(PALETTE['dark_purple'], 8)};")
    print(f"  --dither-dark-75: {generate_bayer_svg_4x(PALETTE['dark_purple'], 12)};")
    print(f"  --dither-navy-25: {generate_bayer_svg_4x(PALETTE['navy'], 4)};")
    print(f"  --dither-navy-50: {generate_bayer_svg_4x(PALETTE['navy'], 8)};")
    print(f"  --dither-midnight-25: {generate_bayer_svg_4x(PALETTE['midnight'], 4)};")
    print(f"  --dither-midnight-50: {generate_bayer_svg_4x(PALETTE['midnight'], 8)};")
    print()

    # White/cream dithers (for light mode overlays)
    print("  /* White/Cream - for light mode and highlights */")
    print(f"  --dither-white-12: {generate_bayer_svg_4x(PALETTE['white'], 2)};")
    print(f"  --dither-white-25: {generate_bayer_svg_4x(PALETTE['white'], 4)};")
    print(f"  --dither-white-37: {generate_bayer_svg_4x(PALETTE['white'], 6)};")
    print(f"  --dither-white-50: {generate_bayer_svg_4x(PALETTE['white'], 8)};")
    print(f"  --dither-white-62: {generate_bayer_svg_4x(PALETTE['white'], 10)};")
    print(f"  --dither-white-75: {generate_bayer_svg_4x(PALETTE['white'], 12)};")
    print(f"  --dither-white-87: {generate_bayer_svg_4x(PALETTE['white'], 14)};")
    print()

    # Black dithers (for light mode shadows)
    print("  /* Black - for light mode shadows */")
    print(f"  --dither-black-12: {generate_bayer_svg_4x(PALETTE['black'], 2)};")
    print(f"  --dither-black-25: {generate_bayer_svg_4x(PALETTE['black'], 4)};")
    print(f"  --dither-black-50: {generate_bayer_svg_4x(PALETTE['black'], 8)};")
    print(f"  --dither-black-75: {generate_bayer_svg_4x(PALETTE['black'], 12)};")
    print()

    # -------------------------------------------------------------------------
    # TEXTURE PATTERNS
    # -------------------------------------------------------------------------
    print("  /* ==========================================================================")
    print("     TEXTURE PATTERNS - 4x Scaled")
    print("     ========================================================================== */")
    print()

    print("  /* Scanlines - 8px height with 4px visible line */")
    print(f"  --pattern-scanlines: {generate_scanlines_svg_4x(PALETTE['black'], 0.08)};")
    print(f"  --pattern-scanlines-light: {generate_scanlines_svg_4x(PALETTE['white'], 0.05)};")
    print()

    print("  /* Checkerboards - 8x8 with 4x4 squares */")
    print(f"  --pattern-checker-purple: {generate_checker_svg_4x(PALETTE['purple'])};")
    print(f"  --pattern-checker-cyan: {generate_checker_svg_4x(PALETTE['cyan'])};")
    print(f"  --pattern-checker-pink: {generate_checker_svg_4x(PALETTE['pink'])};")
    print(f"  --pattern-checker-dark: {generate_checker_svg_4x(PALETTE['dark_purple'])};")
    print()

    print("  /* Dots - 16x16 with 4px radius dots */")
    print(f"  --pattern-dots-pink: {generate_dots_svg_4x(PALETTE['pink'], 4)};")
    print(f"  --pattern-dots-cyan: {generate_dots_svg_4x(PALETTE['cyan'], 4)};")
    print(f"  --pattern-dots-purple: {generate_dots_svg_4x(PALETTE['purple'], 4)};")
    print()

    print("  /* Crosshatch - 32x32 with 4px strokes */")
    print(f"  --pattern-crosshatch: {generate_crosshatch_svg_4x(PALETTE['dark_purple'])};")
    print(f"  --pattern-crosshatch-light: {generate_crosshatch_svg_4x(PALETTE['purple'])};")
    print()

    # -------------------------------------------------------------------------
    # HORIZONTAL BAYER GRADIENT PATTERNS (for callouts, etc.)
    # -------------------------------------------------------------------------
    print("  /* ==========================================================================")
    print("     HORIZONTAL BAYER GRADIENTS - Dithered fade left to right")
    print("     192px wide (12 cells), tiles vertically, use background-repeat: repeat-y")
    print("     ========================================================================== */")
    print()

    print("  /* Callout accent gradients - light */")
    print(f"  --gradient-bayer-cyan: {generate_bayer_horizontal_gradient_svg(PALETTE['cyan'])};")
    print(f"  --gradient-bayer-pink: {generate_bayer_horizontal_gradient_svg(PALETTE['pink'])};")
    print(f"  --gradient-bayer-orange: {generate_bayer_horizontal_gradient_svg(PALETTE['orange'])};")
    print(f"  --gradient-bayer-blue: {generate_bayer_horizontal_gradient_svg(PALETTE['blue'])};")
    print(f"  --gradient-bayer-yellow: {generate_bayer_horizontal_gradient_svg(PALETTE['yellow'])};")
    print(f"  --gradient-bayer-purple: {generate_bayer_horizontal_gradient_svg(PALETTE['purple'])};")
    print()

    print("  /* Callout accent gradients - dark */")
    print(f"  --gradient-bayer-dark-cyan: {generate_bayer_horizontal_gradient_svg(PALETTE['dark_cyan'])};")
    print(f"  --gradient-bayer-dark-pink: {generate_bayer_horizontal_gradient_svg(PALETTE['dark_pink'])};")
    print(f"  --gradient-bayer-dark-orange: {generate_bayer_horizontal_gradient_svg(PALETTE['dark_orange'])};")
    print(f"  --gradient-bayer-dark-blue: {generate_bayer_horizontal_gradient_svg(PALETTE['dark_blue'])};")
    print(f"  --gradient-bayer-dark-yellow: {generate_bayer_horizontal_gradient_svg(PALETTE['dark_yellow'])};")
    print(f"  --gradient-bayer-dark-purple: {generate_bayer_horizontal_gradient_svg(PALETTE['dark_purple'])};")
    print()

    # -------------------------------------------------------------------------
    # STEPPED GRADIENTS
    # -------------------------------------------------------------------------
    print("  /* ==========================================================================")
    print("     STEPPED GRADIENTS - Color Banding")
    print("     ========================================================================== */")
    print()

    # Main background gradient - deep to purple
    bg_colors = [PALETTE['midnight'], PALETTE['deep_purple'], PALETTE['dark_purple'], PALETTE['purple']]
    print(f"  --gradient-bg-main: {generate_stepped_gradient(bg_colors)};")

    # Accent horizontal gradient
    accent_h = [PALETTE['dark_cyan'], PALETTE['cyan'], PALETTE['blue'], PALETTE['purple'], PALETTE['pink']]
    print(f"  --gradient-accent-h: {generate_stepped_gradient(accent_h, 'to right')};")

    # Warm sunset gradient
    warm = [PALETTE['purple'], PALETTE['pink'], PALETTE['orange'], PALETTE['yellow']]
    print(f"  --gradient-warm: {generate_stepped_gradient(warm)};")

    # Cool gradient
    cool = [PALETTE['midnight'], PALETTE['dark_blue'], PALETTE['blue'], PALETTE['cyan']]
    print(f"  --gradient-cool: {generate_stepped_gradient(cool)};")

    # Rainbow bar
    rainbow = [PALETTE['cyan'], PALETTE['blue'], PALETTE['purple'], PALETTE['pink'], PALETTE['orange'], PALETTE['yellow']]
    print(f"  --gradient-rainbow-h: {generate_stepped_gradient(rainbow, 'to right')};")

    # Light mode gradient
    light_bg = [PALETTE['white'], '#e8e5d0', '#dfdcc7', '#d6d3be']
    print(f"  --gradient-bg-light: {generate_stepped_gradient(light_bg)};")

    print("}")


if __name__ == "__main__":
    main()
