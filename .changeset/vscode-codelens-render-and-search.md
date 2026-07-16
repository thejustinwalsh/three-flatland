---
'@three-flatland/vscode': patch
---

FL Audio CodeLens fixes + marketplace discoverability. The inert `Unresolved` / `Searching…` / `Not Found` lens titles rendered as a bare, invisible icon (VS Code collapses a regular space after a `$(icon)` codicon) — fixed with a non-breaking space so the label shows. The `Unresolved` lens is now clickable: it pops an information message explaining that the sound can't be determined by static analysis (live input, a sprite/preset, or a runtime-only value). The marketplace listing now surfaces for `Three.js` / `React Three Fiber` searches (description + keywords).
