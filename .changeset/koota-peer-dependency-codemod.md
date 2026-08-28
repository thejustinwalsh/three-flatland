---
'three-flatland': patch
---

docs: add a codemod for removing the former `koota` peer dependency, at
`codemods/koota-peer-dependency-removal.md`. It removes the dependency only from
manifests that declared it to satisfy the old peer requirement, and leaves it in
place wherever the application imports Koota itself.
