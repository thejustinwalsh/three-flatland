# @three-flatland/vscode

## 0.2.0-alpha.6

### Patch Changes

- feaf721: Keep React runtime consumers on React Three Fiber's WebGPU entrypoint so Devtools, Skia, and the VS Code encoder webview do not retain the legacy R3F/WebGL module graph. A TypeScript-syntax-aware repository guard now catches multiline imports, re-exports, dynamic imports, and CommonJS requires while allowing type-only references.

  Simplify generated React and Three.js starter renderer failures to use the native R3F `Canvas` fallback or a DOM error scoped specifically to terminal renderer initialization failure, removing custom backend-probing machinery and keeping the starter output aligned with Three's built-in WebGPU-to-WebGL 2 node-backend fallback.

- Updated dependencies [9dcf4f7]
- Updated dependencies [0fe56e5]
- Updated dependencies [feaf721]
- Updated dependencies [1a48e67]
- Updated dependencies [0fe56e5]
- Updated dependencies [939cd64]
  - three-flatland@0.1.0-alpha.11
  - @three-flatland/bake@0.1.0-alpha.3
  - @three-flatland/preview@1.0.0-alpha.3
  - @three-flatland/image@0.1.0-alpha.4
  - @three-flatland/normals@0.1.0-alpha.5

## 0.2.0-alpha.5

### Patch Changes

- Updated dependencies [f3c3de8]
- Updated dependencies [2224926]
- Updated dependencies [9d733a7]
  - three-flatland@0.1.0-alpha.10
  - @three-flatland/image@0.1.0-alpha.3
  - @three-flatland/normals@0.1.0-alpha.4
  - @three-flatland/preview@1.0.0-alpha.2

## 0.2.0-alpha.4

### Patch Changes

- 2460dc0: build: bump sharp to ^0.35.0 (Dependabot advisory GHSA — dev-time icon pipeline).

## 0.2.0-alpha.3

### Patch Changes

- Updated dependencies [2b6f4be]
  - @three-flatland/image@0.1.0-alpha.2
  - three-flatland@0.1.0-alpha.9

## 0.2.0-alpha.2

### Patch Changes

- Updated dependencies [7617e28]
  - @three-flatland/image@0.1.0-alpha.1

## 0.2.0-alpha.1

### Patch Changes

- Updated dependencies [2df7c13]
- Updated dependencies [c2e81f1]
- Updated dependencies [6dac6fd]
- Updated dependencies [00c4ae5]
  - three-flatland@0.1.0-alpha.9
  - @three-flatland/image@0.1.0-alpha.0
  - @three-flatland/preview@1.0.0-alpha.1

## 0.2.0-alpha.0

### Minor Changes

- ff23049: FL Audio CodeLens fixes + marketplace discoverability. The inert `Unresolved` / `Searching…` / `Not Found` lens titles rendered as a bare, invisible icon (VS Code collapses a regular space after a `$(icon)` codicon) — fixed with a non-breaking space so the label shows. The `Unresolved` lens is now clickable: it pops an information message explaining that the sound can't be determined by static analysis (live input, a sprite/preset, or a runtime-only value). The marketplace listing now surfaces for `Three.js` / `React Three Fiber` searches (description + keywords).
- 847f0e2: Add a Get Started walkthrough — VS Code opens it on install to introduce the five tools (Sprite Atlas, Image Encoder, Normal Baker, Atlas Merge, Audio) and how they surface: right-click asset files in the Explorer, and a ▶ Play CodeLens above audio calls in your code.
- 023c455: Initial publish-ready release of the Flatland Tools VS Code extension: FL Sprite Atlas (packing + animation editor, TexturePacker/Aseprite read+write), FL Image Encoder (PNG/WebP/AVIF/KTX2 comparison + encoding), FL Normal Baker (region editor for baking normal maps), FL Atlas Merge, and FL Audio (inline ZzFX/ZzFXM/Tone.js/Wad playback via CodeLens, plus the ZzFX Studio tuner panel). Packaged for both the VS Code Marketplace and Open VSX.

### Patch Changes

- Updated dependencies [75fcf94]
- Updated dependencies [abad04f]
- Updated dependencies [d3ee466]
- Updated dependencies [12bacea]
- Updated dependencies [26739f3]
- Updated dependencies [2f94520]
- Updated dependencies [e4c3c68]
- Updated dependencies [9b04cfa]
- Updated dependencies [ea7ec3d]
- Updated dependencies [6caf0f8]
- Updated dependencies [0033ea6]
- Updated dependencies [a8b7e5d]
- Updated dependencies [30550a2]
- Updated dependencies [9b04cfa]
- Updated dependencies [6caf0f8]
- Updated dependencies [192774c]
- Updated dependencies [261b5be]
  - three-flatland@0.1.0-alpha.8
  - @three-flatland/normals@0.1.0-alpha.3
  - @three-flatland/preview@1.0.0-alpha.0
