---
'three-flatland': patch
---

fix: correct the debug subpath named in the `RenderStats` docblock. It said
`@three-flatland/debug`, which is not a package and not an export. The devtools
producer is reachable at the `three-flatland/debug-protocol` subpath. The wrong
name reached the generated API reference and was copied into a guide.
