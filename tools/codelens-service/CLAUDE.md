# @three-flatland/codelens-service

> Agent-facing reference for the TypeScript client of the `codelens-service` Rust sidecar.

## Two halves of this directory

- **`sidecar/`** — the Rust binary (`cargo build`). Standalone stdio JSON-RPC process; scans a workspace for `zzfx(...)` calls via tree-sitter, caches results in SQLite. See `sidecar/src/` — `model.rs` (wire types), `handlers.rs` (the five methods), `rpc.rs` (JSON-RPC envelope), `framing.rs` (LSP framing).
- **This package (`tools/codelens-service/`)** — the TypeScript client that spawns that binary and speaks its protocol. `import { CodelensServiceClient } from '@three-flatland/codelens-service'`.

The two are protocol-compatible by hand, not by a shared schema — `src/protocol.ts` mirrors `sidecar/src/model.rs`/`handlers.rs` field-for-field. If you change one side's wire shape, update the other and both test suites.

## Binary resolution is the caller's job

`CodelensServiceClient` takes a `command` (path or PATH-resolvable name) — it does not know how to find the sidecar binary itself. Dev mode: `tools/codelens-service/sidecar/target/debug/codelens-service` (or `target/release/...` for a release build). A VSIX-bundled path is a separate concern for whoever wires this into the VS Code extension.

## API

```ts
const client = new CodelensServiceClient({ command: '/path/to/codelens-service' })

const init = await client.initialize({ workspaceRoot, storageUri })
const scan = await client.scan({ candidates: [uri, ...] })       // or { include, exclude, maxFiles }
const parsed = await client.parse({ uri, text })
client.didChange({ uri, text })                                   // fire-and-forget, no response
await client.shutdown()                                           // resolves once the process has exited
client.dispose()                                                  // hard kill, no handshake
```

- `client.request(method, params)` / `client.notify(method, params)` are also exported for anything not covered by the named methods above — both are typed against `RequestMethods`/`NotificationMethods` in `src/protocol.ts`.
- Errors from the sidecar (JSON-RPC `-32601`/`-32602`/`-32700`, or an application error code) reject as `CodelensServiceError` with `.code` and `.message`.
- If the process fails to spawn, exits unexpectedly, or a request is sent after it has already exited, the promise rejects as `CodelensServiceExitedError`. Check `client.isExited` before assuming a hung request is still in flight.
- `client.stderr` is the child's raw stderr `Readable` — pipe it to a VS Code output channel or similar; the sidecar never writes protocol data there, only diagnostics.

## Framing — the byte-exact part

`src/framing.ts`'s `MessageDecoder` mirrors `sidecar/src/framing.rs` exactly: `Content-Length` counts **UTF-8 bytes**, not `string.length` (UTF-16 code units) — a source file with non-ASCII characters in its `text` param would desync the stream if you count wrong. `encodeMessage`/`MessageDecoder` both work in `Buffer`, not `string`, until the final `JSON.parse`, specifically to keep byte-length arithmetic correct. Don't "simplify" this to string-length counting.

`MessageDecoder.push()` is a streaming reassembler — child process stdout delivers arbitrary chunk boundaries (mid-header, mid-body, multiple messages per chunk). It buffers across `push()` calls; see `src/framing.test.ts` for the boundary cases it's proven against (byte-by-byte delivery, a split landing inside a multi-byte UTF-8 character, etc.).

## Tests — two tiers, know which one you're changing

- **`src/client.test.ts`** — runs against `src/__fixtures__/fakeSidecar.mjs`, a from-scratch ~80-line JS reimplementation of just enough of the protocol to test the client's spawn/framing/request-correlation logic. Fast, no Rust toolchain needed, always runs. If you change the client's plumbing (not the protocol shapes), this is what you're testing against.
- **`src/realSidecar.test.ts`** — spawns the actual built Rust binary at `sidecar/target/debug/codelens-service` and drives a real round trip. `describe.skipIf(!existsSync(...))` — **skips, not fails, if the binary hasn't been built** (`cd sidecar && cargo build`). This is the one that actually proves the two sides agree on the wire format; run it locally after touching either side's protocol code. Don't assume CI runs it — check before relying on it as your only coverage for a protocol change.
- **`src/framing.test.ts`** — pure unit tests of the framing layer, no process involved.

## Common pitfalls

- Editing `src/protocol.ts` without checking `sidecar/src/model.rs` — there's no codegen keeping them in sync; a field rename on one side silently breaks interop (the fake fixture won't catch it since it hand-copies the same shapes — only `realSidecar.test.ts` will).
- Adding a new file under `src/` without adding it to `tools/codelens-service/tsup.config.ts`'s `entry` array — `bundle: false` means every cross-imported file needs its own entry (same gotcha as `tools/io`, see `tools/io/CLAUDE.md`).
- Assuming `Content-Length` is a character count — it's bytes. Test with multi-byte content if you touch `framing.ts`.
- Awaiting `client.shutdown()` without first sending `initialize` — the real sidecar still handles it fine, but if you're testing something order-dependent, `shutdown` doesn't validate that `initialize` happened.

## Reference

- Sidecar protocol source of truth: `sidecar/src/model.rs`, `sidecar/src/handlers.rs`, `sidecar/src/rpc.rs`.
- Client: `src/client.ts`. Protocol types: `src/protocol.ts`. Framing: `src/framing.ts`.
