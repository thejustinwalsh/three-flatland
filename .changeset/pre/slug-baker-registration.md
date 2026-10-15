---
'@three-flatland/slug': patch
---

Register the Slug font baker with `flatland-bake` so it self-discovers.

`slug-bake` worked, but the package declared no `flatland.bake` entry, so
`flatland-bake --list` never showed it — while the dispatcher's own help text
named `@three-flatland/slug` as its example of a registered baker. The baker
entry wraps the existing bin rather than pointing at `src/cli.ts`, which
self-executes at import.
