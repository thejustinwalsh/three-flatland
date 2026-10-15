---
"three-flatland": patch
"create-three-flatland": patch
"@three-flatland/vscode": patch
---

Ship `codemods/koota-peer-dependency-removal.md` with the alpha migration guide, document agent invocation and rerun behavior, and preserve application-owned Koota usage. Correct the frozen-snapshot guidance in `codemods/effect-vector-whole-tuple.md`. Correct the RenderStats debug-protocol import path. Clarify the scaffolder's destructive overwrite option.

The private renderer ECS grew from [Koota](https://github.com/pmndrs/koota). Its typed traits, structure-of-arrays storage, queries, and systems made this specialization possible. Koota remains the recommended general-purpose ECS for application and gameplay state.

Use Nx to build the extension dependency graph before its end-to-end suite, and correct stale release-check and build instructions.

Resolve the macOS VS Code test executable from bundle metadata when the test downloader returns the obsolete `Electron` path.
