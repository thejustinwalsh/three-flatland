# @three-flatland/codelens-service

> Agent-facing reference for the TypeScript client of the `codelens-service` Rust sidecar.

## Two halves of this directory

- **`sidecar/`** — the Rust binary (`cargo build`). Standalone stdio JSON-RPC process; scans a workspace for `zzfx(...)` calls via tree-sitter, caches results in SQLite. See `sidecar/src/` — `model.rs` (wire types), `handlers.rs` (the five methods), `rpc.rs` (JSON-RPC envelope), `framing.rs` (LSP framing).
- **This package (`tools/codelens-service/`)** — the TypeScript client that spawns that binary and speaks its protocol. `import { CodelensServiceClient } from '@three-flatland/codelens-service'`.

The two are protocol-compatible by hand, not by a shared schema — `src/protocol.ts` mirrors `sidecar/src/model.rs`/`handlers.rs` field-for-field (with one intentional rename: the sidecar's `payload` field type is called `FindingPayload` here, not `Payload`). If you change one side's wire shape, update the other and both test suites.

## Binary resolution: `resolveBinary()`

`CodelensServiceClient` takes a plain `binaryPath: string` — it does not resolve anything itself. Use `resolveBinary()` (`src/resolveBinary.ts`) to find it:

```ts
import { resolveBinary, CodelensServiceClient } from '@three-flatland/codelens-service'

// Dev mode / tests: probes sidecar/target/{release,debug}/codelens-service.
const binaryPath = resolveBinary()

// Production (VSIX-packaged extension): supply your own bundled-path
// candidates, and turn off the dev-mode fallback so a stray local cargo
// build on the user's machine is never silently picked up instead.
const binaryPath = resolveBinary({
  candidates: [myBundledPlatformPath],
  includeDevFallback: false,
})
```

Resolution order: `explicitPath` (if given, returned unchecked) > first existing entry in `candidates` > (unless `includeDevFallback: false`) first existing `target/{release,debug}` dev build. Throws — listing every path it looked at — if nothing resolves.

## API

```ts
const client = new CodelensServiceClient({ binaryPath, workspaceRoot, storageUri })

const init = await client.start()                                // spawns + runs the initialize handshake
const scan = await client.scan({ candidates: [uri, ...] })       // or { include, exclude, maxFiles }
const parsed = await client.parse({ uri, text })
client.didChange({ uri, text })                                   // fire-and-forget, no response
await client.shutdown()                                           // graceful; SIGKILL fallback after 5s (configurable)
client.dispose()                                                  // hard kill, no handshake, no timeout
```

- **`start()` does the `initialize` handshake for you** — it spawns the process, wires up stdout/stderr/exit handling, sends `initialize` with `{ workspaceRoot, storageUri }` from the constructor options, and resolves with the `InitializeResult`. There is no separate `client.initialize(...)` call.
- **Calling any method before `start()`** rejects/throws cleanly as `CodelensServiceExitedError` — `request()` (async) rejects, `notify()`/`didChange()` (sync, no return value) throw synchronously. There is no pre-start queue; call `start()` and await it before doing anything else.
- `client.request(method, params)` / `client.notify(method, params)` are exported for anything not covered by the named methods above — both are typed against `RequestMethods`/`NotificationMethods` in `src/protocol.ts`.
- Errors from the sidecar (JSON-RPC `-32601`/`-32602`/`-32700`, or an application error code) reject as `CodelensServiceError` with `.code` and `.message`.
- If the process fails to spawn, exits unexpectedly, or a request is sent after it has already exited, the promise rejects (or `notify`/`didChange` throws) as `CodelensServiceExitedError`. Check `client.isExited` before assuming a hung request is still in flight.
- **`client.onError(handler)` / `client.onExit(handler)`** subscribe to process-level errors (spawn failure, a malformed frame from the sidecar) and process exit, respectively. Both return an **unsubscribe function** — same convention as `tools/bridge`'s `ClientBridge.on()`, see `tools/bridge/CLAUDE.md`. There is no `dispose()`-style bulk unsubscribe; call the returned functions.
- `client.stderr` is the child's raw stderr `Readable` (`undefined` before `start()`) — pipe it to a VS Code output channel or similar; the sidecar never writes protocol data there, only diagnostics.
- `shutdown(timeoutMs = 5000)` sends `shutdown`, awaits the response, then awaits the process actually exiting. If it's still alive after `timeoutMs`, it sends `SIGKILL` and waits for that exit instead — a stuck sidecar cannot hang the caller forever.

## Framing — the byte-exact part

`src/framing.ts`'s `MessageDecoder` mirrors `sidecar/src/framing.rs` exactly: `Content-Length` counts **UTF-8 bytes**, not `string.length` (UTF-16 code units) — a source file with non-ASCII characters in its `text` param would desync the stream if you count wrong. `encodeMessage`/`MessageDecoder` both work in `Buffer`, not `string`, until the final `JSON.parse`, specifically to keep byte-length arithmetic correct. Don't "simplify" this to string-length counting.

`MessageDecoder.push()` is a streaming reassembler — child process stdout delivers arbitrary chunk boundaries (mid-header, mid-body, multiple messages per chunk). It buffers across `push()` calls; see `src/framing.test.ts` for the boundary cases it's proven against (byte-by-byte delivery, a split landing inside a multi-byte UTF-8 character, etc.). A malformed frame from the sidecar (bad JSON body) is caught in `CodelensServiceClient` and routed to `onError` handlers — it does NOT throw uncaught inside the stdout `'data'` listener, and does not corrupt the decoder's ability to read the next well-formed frame.

## Tests — three tiers, know which one you're changing

- **`src/framing.test.ts`** — pure unit tests of the framing layer, no process involved.
- **`src/resolveBinary.test.ts`** — unit tests of resolution precedence. Uses `includeDevFallback: false` wherever it needs a deterministic "nothing resolves" case — this checkout has a real cargo-built debug binary, so leaving the dev fallback on would make those assertions depend on build state.
- **`src/client.test.ts`** — runs against `src/__fixtures__/fakeSidecar.mjs`, a from-scratch ~100-line JS reimplementation of just enough of the protocol (including a `--hang-on-shutdown` mode for testing the SIGKILL fallback, and a `garbage` method for testing `onError`) to test the client's spawn/framing/lifecycle/request-correlation logic. Fast, no Rust toolchain needed, always runs. If you change the client's plumbing (not the protocol shapes), this is what you're testing against.
- **`src/realSidecar.test.ts`** — spawns the **actual built Rust binary**, driven end-to-end through this package's public API. `beforeAll` runs `cargo build` itself (don't assume a prior build is lying around) then resolves the just-built path. `describe.skipIf(!CARGO_AVAILABLE)`, checked via `spawnSync('cargo', ['--version'])` at module load — **skips with a loud `console.warn`, not fails, if cargo isn't on PATH at all.** This is the one that actually proves the two sides agree on the wire format; it's the only place a `protocol.ts` drift from `model.rs` gets caught (the fake fixture hand-copies the same shapes, so it can't notice a real mismatch). Run it locally after touching either side's protocol code — don't assume CI has a Rust toolchain and therefore runs it.

## Common pitfalls

- Editing `src/protocol.ts` without checking `sidecar/src/model.rs` — there's no codegen keeping them in sync; a field rename on one side silently breaks interop (only `realSidecar.test.ts` will catch it).
- Adding a new file under `src/` without adding it to `tools/codelens-service/tsup.config.ts`'s `entry` array — `bundle: false` means every cross-imported file needs its own entry (same gotcha as `tools/io`, see `tools/io/CLAUDE.md`).
- Assuming `Content-Length` is a character count — it's bytes. Test with multi-byte content if you touch `framing.ts`.
- Calling `client.scan()`/`client.parse()`/etc. before `await client.start()` — there is no queue, it rejects/throws immediately (by design, see API section above).
- Writing `resolveBinary()` tests without `includeDevFallback: false` when asserting a "not found" case — it'll silently pass or fail depending on whether the sidecar happens to be built in that checkout.

## Reference

- Sidecar protocol source of truth: `sidecar/src/model.rs`, `sidecar/src/handlers.rs`, `sidecar/src/rpc.rs`.
- Client: `src/client.ts`. Protocol types: `src/protocol.ts`. Framing: `src/framing.ts`. Binary resolution: `src/resolveBinary.ts`.
