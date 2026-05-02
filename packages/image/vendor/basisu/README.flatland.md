# Vendored BasisU sources

| Field | Value |
|---|---|
| Upstream | https://github.com/BinomialLLC/basis_universal |
| Tag | v2_1_0 |
| Commit SHA | 45d5f41015eecd9570d5a3f89ab9cc0037a25063 |
| Imported | 2026-05-01 |
| License | Apache-2.0 (see LICENSE) |

## Subset taken

- `encoder/` — full directory (less OpenCL and PVRTC2 sources, see Patches)
- `transcoder/basisu_transcoder.h` and headers transitively included by the encoder
- `zstd/` — encoder's vendored zstd

## Subset NOT taken

- Transcoder `.cpp` files (we only encode)
- `webgl/`, examples/, tests/
- OpenCL build path (`encoder/basisu_opencl.{cpp,h}`)
- PVRTC2 sources (we only target ETC1S + UASTC)

## Patches

Currently zero. Patches added in later phases will be enumerated here with line counts.
