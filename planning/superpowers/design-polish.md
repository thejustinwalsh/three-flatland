# Design polish — uikit fork

Opinionated visual improvements (not bugs). Distinct from `bug-ledger.md`.

## P1 — Scrollbar thumb should match the kit style

The scroll container's thumb reads as an OS-default afterthought. Key point: **uikit renders its own
scrollbar as a panel in the 3D scene — it is NOT the OS/DOM scrollbar**, so it is fully under our
control and is identical on every OS (macOS rounded, Windows/Linux square only applies to native DOM
scrollbars, which this isn't). So we can and should theme it:

- Round the thumb (`borderRadius` to match the kit's radius scale), inset it from the track,
- give it a muted fill from the theme (`colors.border` / `mutedForeground`), with a subtle
  hover/active brighten,
- thin it and pad the track so it reads as intentional, not a raw block.

Lives in the scroll/scrollbar styling in `packages/uikit/src/` (the scrollbar thumb panel) and/or a
kit-level `ScrollArea`. Verify against the shadcn scrollbar look, in the conformance example.

## P2 — DPR / pixel-art lever (documented, resolved)

Chunky sprites come from the texture filter (`TextureConfig` `'pixel-art'` → NearestFilter), NOT from
downscaling the canvas. Never reach for `setPixelRatio(1)` + `image-rendering: pixelated` when UI
text shares the frame — it pixelates Slug's analytic text too. Already applied to the example twins;
noted here so the lesson isn't relearned.
