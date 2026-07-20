---
"@three-flatland/image": minor
---

> Branch: feat/create-three-flatland
> PR: https://github.com/thejustinwalsh/three-flatland/pull/203

### 813a90d39d9a5060652f7322ebb60b8fa355d8c2
fix: generate dist-only publishConfig.exports
Publishing pulled the package into a convention it was exempt from while
private: publishable packages carry a publishConfig.exports that strips the dev
`source` condition, so consumers resolve dist and never unpacked src. Verified
in the tarball — no source condition survives, and all four subpaths
(., ./node, ./cli, ./loaders/ktx2) point at dist.
Files: packages/image/package.json
Stats: 1 file changed, 30 insertions(+)

### 00c4ae5471607e6659304c3019fd1a778c0c654d
feat: publish @three-flatland/image; halve the tarball
The package was complete but never un-privated: PNG/WebP/AVIF/KTX2 encode+decode,
Ktx2Loader, and the flatland-bake encode baker. Nothing marked it deliberately
internal — it was absent from .changeset/config.json's ignore list, and sat at
private:true/0.0.0, the never-released default. This makes KTX2 reachable by
consumers for the first time, via both the loader and the encode CLI.

Also exclude dist/libs from the tarball. The build copies libs/basis into dist,
but the built runtime resolves ../../libs/basis from dist/runtime/ — i.e. the
package root — so the dist copy was 3.5MB of unreachable duplicate. Verified by
encoding a real KTX2 with dist/libs deleted. Packed size 2.9MB to 1.5MB.
Files: .changeset/image-initial-release.md, packages/image/package.json
Stats: 2 files changed, 13 insertions(+), 2 deletions(-)
