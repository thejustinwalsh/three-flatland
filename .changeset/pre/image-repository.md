---
'@three-flatland/image': patch
---

fix: add the `repository` and `license` fields to package.json. The empty
`repository.url` made npm reject the publish with E422 (sigstore provenance
could not verify the source repo). With provenance enabled, the field must
match the GitHub repo URL.
