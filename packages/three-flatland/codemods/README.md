# three-flatland codemods

Self-contained Markdown migration recipes, one per breaking change. Point an LLM agent
at an artifact and it applies the migration to your codebase — each file's
"Codemod prompt (LLM-applicable)" section is the agent's instruction set.

After installing the package they live at `node_modules/three-flatland/codemods/`.

| Codemod                                                        | Availability          | What it migrates                                                                                                                                                           |
| -------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [layers-to-sort-layers.md](./layers-to-sort-layers.md)         | Since 0.1.0-alpha.8   | Render-order API rename: `layer`/`Layers`/`LayerManager` → `sortLayer`/`SortLayers`/`SortLayerManager` (camera layer masks and tile layers intentionally keep their names) |
| [effect-vector-whole-tuple.md](./effect-vector-whole-tuple.md) | Private-ECS migration | Direct component writes to Material, Light, and Pass effect vector fields → whole-tuple assignment; dynamic and aliased mutations are flagged for review                   |
| [koota-peer-dependency-removal.md](./koota-peer-dependency-removal.md) | Private-ECS migration | Removes the `koota` dependency from manifests that declared it only for the former peer requirement; manifests whose own source imports Koota are left unchanged |
