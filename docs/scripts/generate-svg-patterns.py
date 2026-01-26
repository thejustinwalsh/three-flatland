#!/usr/bin/env python3
"""
Generate essential SVG patterns for the retro theme.
Keep it simple - just the main background gradient and stars.
"""

from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "public" / "patterns"

PALETTE = {
    'white': '#f0edd8',
    'pink': '#d94c87',
    'purple': '#732866',
    'dark_purple': '#3d1b47',
    'deep_purple': '#1e0f2e',
    'cyan': '#47cca9',
    'midnight': '#050618',
}

# Bayer 8x8 for dithering
BAYER_8x8 = [
    [0,  32, 8,  40, 2,  34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4,  36, 14, 46, 6,  38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3,  35, 11, 43, 1,  33, 9,  41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7,  39, 13, 45, 5,  37],
    [63, 31, 55, 23, 61, 29, 53, 21],
]


def generate_dithered_gradient(colors: list, width: int = 8, height: int = 256) -> str:
    """Vertical gradient with Bayer dithering."""
    pixels = []
    num_colors = len(colors)
    band_height = height / (num_colors - 1)

    for y in range(height):
        band_idx = min(int(y / band_height), num_colors - 2)
        progress = (y / band_height) - band_idx

        c1, c2 = colors[band_idx], colors[band_idx + 1]

        for x in range(width):
            threshold = BAYER_8x8[y % 8][x % 8] / 64.0
            color = c2 if progress > threshold else c1
            pixels.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">
{''.join(pixels)}
</svg>'''


def generate_stars(width: int = 64, height: int = 64) -> str:
    """Simple starfield."""
    import hashlib
    stars = []

    for y in range(height):
        for x in range(width):
            h = int(hashlib.md5(f"{x},{y}".encode()).hexdigest()[:4], 16)
            if h / 65535 < 0.025:
                color = [PALETTE['white'], PALETTE['cyan'], PALETTE['pink']][h % 3]
                stars.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">
<rect width="{width}" height="{height}" fill="{PALETTE['midnight']}"/>
{''.join(stars)}
</svg>'''


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Main background - purple fade
    colors = [
        PALETTE['midnight'],
        PALETTE['deep_purple'],
        PALETTE['dark_purple'],
        PALETTE['purple'],
        PALETTE['dark_purple'],
        PALETTE['deep_purple'],
        PALETTE['midnight'],
    ]
    (OUTPUT_DIR / "bg-gradient.svg").write_text(generate_dithered_gradient(colors, 8, 512))
    print("Created bg-gradient.svg")

    # Stars
    (OUTPUT_DIR / "stars.svg").write_text(generate_stars(64, 64))
    print("Created stars.svg")


if __name__ == "__main__":
    main()
