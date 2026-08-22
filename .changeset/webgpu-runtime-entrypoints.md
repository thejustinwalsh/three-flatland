---
'@three-flatland/devtools': patch
'@three-flatland/skia': patch
'create-three-flatland': patch
'@three-flatland/vscode': patch
---

Keep React runtime consumers on React Three Fiber's WebGPU entrypoint so Devtools, Skia, and the VS Code encoder webview do not retain the legacy R3F/WebGL module graph. A TypeScript-syntax-aware repository guard now catches multiline imports, re-exports, dynamic imports, and CommonJS requires while allowing type-only references.

Simplify generated React and Three.js starter renderer failures to use the native R3F `Canvas` fallback or a DOM startup error, removing custom backend-probing machinery and keeping the starter output aligned with Three's built-in WebGPU-to-WebGL 2 node-backend fallback.
