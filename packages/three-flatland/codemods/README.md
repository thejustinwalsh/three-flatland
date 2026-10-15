# three-flatland codemods

Self-contained Markdown migration recipes, one per breaking change. Point an LLM agent
at an artifact and it applies the migration to your codebase — each file's
"Codemod prompt (LLM-applicable)" section is the agent's instruction set.

After installing the package they live at `node_modules/three-flatland/codemods/`.

| Codemod                                                        | Availability          | What it migrates                                                                                                                                                           |
| -------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [layers-to-sort-layers.md](./layers-to-sort-layers.md)         | Since 0.1.0-alpha.8   | Render-order API rename: `layer`/`Layers`/`LayerManager` → `sortLayer`/`SortLayers`/`SortLayerManager` (camera layer masks and tile layers intentionally keep their names) |
| [effect-vector-whole-tuple.md](./effect-vector-whole-tuple.md) | Since 0.1.0-alpha.11 | Direct component writes to Material, Light, and Pass effect vector fields → whole-tuple assignment; dynamic and aliased mutations are flagged for review                   |
| [koota-peer-dependency-removal.md](./koota-peer-dependency-removal.md) | Since 0.1.0-alpha.11 | Remove the former peer only from confirmed peer-only consumers; retain application Koota use and flag ambiguous cases. |

## Invocation

These are agent-applied Markdown recipes, not an executable CLI. After installing the release,
ask your coding agent:

```text
Read node_modules/three-flatland/codemods/README.md and apply the Koota peer
removal and effect-vector recipes to this application. Review every candidate,
report ambiguous sites, and rerun to confirm no further changes.
```

Review the resulting diff, reinstall with your project's package manager, and run its normal
checks. Removed renderer world/entity compatibility handles have no automatic replacement;
follow the [migration guide](https://tjw.dev/three-flatland/guides/private-ecs-migration/).
