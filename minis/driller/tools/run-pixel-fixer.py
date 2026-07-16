#!/usr/bin/env python3
"""Run Retro Diffusion's open-source fixer over staged Driller cutouts."""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pixel-fixer-root", type=Path, required=True)
    parser.add_argument("--source-revision", default="unknown")
    args = parser.parse_args()

    python_root = args.pixel_fixer_root / "python"
    sys.path.insert(0, str(python_root))
    from pixelfixer.api import process
    from pixelfixer.reconstruct import two_stage_pack

    args.output.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, object]] = []
    for source in sorted(args.input.glob("*.png")):
        if source.name.startswith("character-") or source.name == "title-attract.png":
            # The concept sheet's pseudo-pixels average ~2.75 source pixels.
            # One native output pixel per implied cell yields a ~24 px-tall
            # standing silhouette: 1.5 gameplay tiles, matching arcade norms.
            # The title uses that same authored pseudo-pixel grid; its native
            # result is cropped to the production lockup by the atlas script.
            result = process(source.read_bytes(), force_step=2.75)
            png = result.pop("png")
        else:
            if source.name.startswith(("tile-", "fixture-")):
                target_size = 16
            else:
                gem_column = int(source.stem.rsplit("-", 1)[1])
                target_size = (8, 12, 16, 20)[gem_column]
            rgba = np.array(Image.open(source).convert("RGBA"))
            fixed = two_stage_pack(rgba, target_size, target_size)
            buffer = io.BytesIO()
            Image.fromarray(fixed).save(buffer, "PNG")
            png = buffer.getvalue()
            result = {
                "cols": target_size,
                "rows": target_size,
                "step_x": round(rgba.shape[1] / target_size, 4),
                "step_y": round(rgba.shape[0] / target_size, 4),
                "consensus": "forced-target",
                "confidence": "high",
            }
        destination = args.output / source.name
        destination.write_bytes(png)
        results.append({"file": source.name, **result})
        print(
            f"{source.name:46s} {result['cols']}x{result['rows']} "
            f"{result['consensus']}"
        )

    report = {
        "engine": "Retro-Diffusion/pixel-art-fixer",
        "revision": args.source_revision,
        "input": str(args.input),
        "count": len(results),
        "results": results,
    }
    (args.output.parent / "report.json").write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf8",
    )


if __name__ == "__main__":
    main()
