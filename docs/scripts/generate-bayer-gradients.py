#!/usr/bin/env python3
"""
Generate true Bayer matrix dithered gradient SVGs for SNES-style backgrounds.

The Bayer 4x4 ordered dithering matrix:
  0  8  2 10
 12  4 14  6
  3 11  1  9
 15  7 13  5

Each value (0-15) represents a threshold. For a gradient from color A to B,
at each position we compare the gradient value (0-15) to the threshold.
If gradient >= threshold, use color B, else use color A.

This creates the classic "checkerboard dissolve" effect seen in SNES games.
"""

import math
from pathlib import Path

# Bayer 4x4 matrix (normalized to 0-15)
BAYER_4x4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
]

# Our retro color palette
COLORS = {
    'midnight': '#050618',
    'deep-purple': '#1e0f2e',
    'dark-purple': '#3d1b47',
    'purple': '#732866',
    'pink': '#d94c87',
    'cyan': '#47cca9',
    'blue': '#0bafe6',
    'dark-cyan': '#1b6b5a',
    'navy': '#0a0b24',
    'white': '#f0edd8',
    'yellow': '#f2d24b',
    'orange': '#e87d3e',
}

def generate_bayer_gradient_svg(
    color_a: str,
    color_b: str,
    width: int,
    height: int,
    direction: str = 'vertical',
    pixel_size: int = 4
) -> str:
    """
    Generate an SVG with true Bayer dithered gradient.

    Args:
        color_a: Starting color (hex)
        color_b: Ending color (hex)
        width: SVG width in pixels
        height: SVG height in pixels
        direction: 'vertical' (top to bottom) or 'horizontal' (left to right)
        pixel_size: Size of each "pixel" in the dither pattern
    """
    # Calculate grid dimensions
    cols = width // pixel_size
    rows = height // pixel_size

    rects = []

    for row in range(rows):
        for col in range(cols):
            # Get position in gradient (0.0 to 1.0)
            if direction == 'vertical':
                t = row / max(rows - 1, 1)
            else:
                t = col / max(cols - 1, 1)

            # Convert to 0-15 range for Bayer comparison
            gradient_level = t * 15

            # Get Bayer threshold for this position
            bayer_x = col % 4
            bayer_y = row % 4
            threshold = BAYER_4x4[bayer_y][bayer_x]

            # Choose color based on threshold comparison
            color = color_b if gradient_level >= threshold else color_a

            # Create rect
            x = col * pixel_size
            y = row * pixel_size
            rects.append(f'<rect x="{x}" y="{y}" width="{pixel_size}" height="{pixel_size}" fill="{color}"/>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" shape-rendering="crispEdges">
{chr(10).join(rects)}
</svg>'''

    return svg


def generate_multi_color_gradient_svg(
    colors: list,
    width: int,
    height: int,
    direction: str = 'vertical',
    pixel_size: int = 4
) -> str:
    """
    Generate an SVG with multi-stop Bayer dithered gradient.

    Args:
        colors: List of colors to transition through
        width: SVG width in pixels
        height: SVG height in pixels
        direction: 'vertical' or 'horizontal'
        pixel_size: Size of each "pixel"
    """
    cols = width // pixel_size
    rows = height // pixel_size
    num_colors = len(colors)

    rects = []

    for row in range(rows):
        for col in range(cols):
            # Get position in gradient (0.0 to 1.0)
            if direction == 'vertical':
                t = row / max(rows - 1, 1)
            else:
                t = col / max(cols - 1, 1)

            # Determine which color pair we're between
            segment = t * (num_colors - 1)
            color_index = int(segment)
            color_index = min(color_index, num_colors - 2)  # Clamp to valid range

            # Get local position within this segment (0.0 to 1.0)
            local_t = segment - color_index

            # Convert to 0-15 range for Bayer comparison
            gradient_level = local_t * 15

            # Get Bayer threshold for this position
            bayer_x = col % 4
            bayer_y = row % 4
            threshold = BAYER_4x4[bayer_y][bayer_x]

            # Choose color based on threshold comparison
            color = colors[color_index + 1] if gradient_level >= threshold else colors[color_index]

            # Create rect
            x = col * pixel_size
            y = row * pixel_size
            rects.append(f'<rect x="{x}" y="{y}" width="{pixel_size}" height="{pixel_size}" fill="{color}"/>')

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" shape-rendering="crispEdges">
{chr(10).join(rects)}
</svg>'''

    return svg


def generate_tiled_gradient_pattern(
    colors: list,
    tile_width: int = 64,
    tile_height: int = 256,
    pixel_size: int = 4
) -> str:
    """
    Generate a tileable gradient pattern for CSS background.
    The pattern tiles horizontally but has full gradient vertically.
    """
    return generate_multi_color_gradient_svg(
        colors=colors,
        width=tile_width,
        height=tile_height,
        direction='vertical',
        pixel_size=pixel_size
    )


def svg_to_data_uri(svg: str) -> str:
    """Convert SVG to data URI for CSS."""
    import urllib.parse
    encoded = urllib.parse.quote(svg, safe='<>=/"\'')
    return f'url("data:image/svg+xml,{encoded}")'


def main():
    output_dir = Path(__file__).parent.parent / 'public' / 'patterns'
    output_dir.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # BOTTOM OMBRE - Simple navy to deep-purple fade for bottom of page
    # Short, subtle gradient that sits at the very bottom
    # =========================================================================
    bottom_ombre_colors = [
        COLORS['midnight'],      # Match the solid page background
        COLORS['navy'],          # Slight lift
        COLORS['deep-purple'],   # Purple accent at bottom
    ]

    bottom_ombre_svg = generate_multi_color_gradient_svg(
        colors=bottom_ombre_colors,
        width=64,   # Narrow tile (tiles horizontally)
        height=256, # Height matches 25vh at typical viewport
        direction='vertical',
        pixel_size=8  # Visible pixel size for retro feel
    )

    (output_dir / 'bottom-ombre.svg').write_text(bottom_ombre_svg)
    print("Generated: bottom-ombre.svg")

    # =========================================================================
    # HERO GRADIENT - Cyan to Blue to Purple to Pink (tall, for hero section)
    # =========================================================================
    hero_colors = [
        COLORS['cyan'],
        COLORS['blue'],
        COLORS['purple'],
        COLORS['pink'],
    ]

    hero_svg = generate_multi_color_gradient_svg(
        colors=hero_colors,
        width=128,  # Tiles horizontally (2x wider for larger pixels)
        height=512,  # Tall for hero
        direction='vertical',
        pixel_size=8  # 2x larger pixels for HiDPI visibility
    )

    (output_dir / 'hero-gradient.svg').write_text(hero_svg)
    print("Generated: hero-gradient.svg")

    # =========================================================================
    # PAGE BACKGROUND - Muted, unified gradient for entire site
    # Uses darker, more subdued colors so content remains readable
    # =========================================================================
    page_colors = [
        COLORS['midnight'],      # Very dark at top
        COLORS['deep-purple'],   # Slightly lighter
        COLORS['dark-purple'],   # Mid-dark purple
        COLORS['purple'],        # Purple accent
        COLORS['dark-purple'],   # Back to darker
        COLORS['deep-purple'],   # Even darker at bottom
    ]

    page_svg = generate_multi_color_gradient_svg(
        colors=page_colors,
        width=128,  # 2x wider for larger pixels
        height=1024,  # Very tall for full page
        direction='vertical',
        pixel_size=8  # 2x larger pixels for HiDPI visibility
    )

    (output_dir / 'page-gradient.svg').write_text(page_svg)
    print("Generated: page-gradient.svg")

    # =========================================================================
    # HERO GRADIENT VARIANT 2 - Warmer (Pink to Orange to Yellow)
    # =========================================================================
    warm_colors = [
        COLORS['purple'],
        COLORS['pink'],
        COLORS['orange'],
        COLORS['yellow'],
    ]

    warm_svg = generate_multi_color_gradient_svg(
        colors=warm_colors,
        width=128,  # 2x wider for larger pixels
        height=512,
        direction='vertical',
        pixel_size=8  # 2x larger pixels for HiDPI visibility
    )

    (output_dir / 'warm-gradient.svg').write_text(warm_svg)
    print("Generated: warm-gradient.svg")

    # =========================================================================
    # COOL GRADIENT - For alternative sections
    # =========================================================================
    cool_colors = [
        COLORS['midnight'],
        COLORS['navy'],
        COLORS['blue'],
        COLORS['cyan'],
    ]

    cool_svg = generate_multi_color_gradient_svg(
        colors=cool_colors,
        width=128,  # 2x wider for larger pixels
        height=512,
        direction='vertical',
        pixel_size=8  # 2x larger pixels for HiDPI visibility
    )

    (output_dir / 'cool-gradient.svg').write_text(cool_svg)
    print("Generated: cool-gradient.svg")

    # =========================================================================
    # Generate CSS custom properties for inline use
    # =========================================================================
    print("\n/* CSS Custom Properties for gradients */")
    print(":root {")

    # Small tile versions for CSS backgrounds
    for name, colors in [
        ('hero', hero_colors),
        ('page', page_colors),
        ('warm', warm_colors),
        ('cool', cool_colors),
    ]:
        small_svg = generate_multi_color_gradient_svg(
            colors=colors,
            width=32,  # Small tile (2x for larger pixels)
            height=128,  # Proportional (2x)
            direction='vertical',
            pixel_size=8  # 2x larger pixels for HiDPI visibility
        )
        data_uri = svg_to_data_uri(small_svg)
        print(f"  --gradient-{name}-dither: {data_uri};")

    print("}")


if __name__ == '__main__':
    main()
