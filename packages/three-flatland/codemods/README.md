# three-flatland codemods

Self-contained Markdown migration recipes, one per breaking change. Point an LLM agent
at an artifact and it applies the migration to your codebase — each file's
"Codemod prompt (LLM-applicable)" section is the agent's instruction set.

After installing the package they live at `node_modules/three-flatland/codemods/`.

| Codemod | First version | What it migrates |
|---|---|---|
| [layers-to-sort-layers.md](./layers-to-sort-layers.md) | 0.1.0-alpha.8 | Render-order API rename: `layer`/`Layers`/`LayerManager` → `sortLayer`/`SortLayers`/`SortLayerManager` (camera layer masks and tile layers intentionally keep their names) |
