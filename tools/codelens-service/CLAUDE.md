# @three-flatland/codelens-service

> Agent-facing reference for the TypeScript client of the `codelens-service` Rust sidecar.

## Two halves of this directory

- **`sidecar/`** — the Rust binary (`cargo build`). Standalone stdio JSON-RPC process; scans a workspace for three kinds of audio references via tree-sitter (see "Finding is a discriminated union" below), caches results in SQLite. See `sidecar/src/` — `model.rs` (wire types), `parse.rs` (the three scanners, one AST walk), `scan.rs` (byte-level candidate pre-filter), `handlers.rs` (the five methods), `rpc.rs` (JSON-RPC envelope), `framing.rs` (LSP framing).
- **This package (`tools/codelens-service/`)** — the TypeScript client that spawns that binary and speaks its protocol. `import { CodelensServiceClient } from '@three-flatland/codelens-service'`.

The two are protocol-compatible by hand, not by a shared schema — `src/protocol.ts` mirrors `sidecar/src/model.rs`/`handlers.rs` field-for-field. If you change one side's wire shape, update the other and both test suites.

## Finding is a discriminated union, not one loose payload shape

`Finding` covers three kinds, each with its own payload — narrow on `kind` before touching `payload`'s fields, both sides:

| Kind | Detects | Payload | `varRef`? |
|---|---|---|---|
| `zzfx.call` (`ZZFX_CALL_KIND`) | `zzfx(...)` / `a.b.zzfx(...)` | `{ params: number[], argRange, varRef? }` | first arg spread/bare identifier resolves one |
| `zzfxm.song` (`ZZFXM_SONG_KIND`) | `zzfxm(...)` / `zzfxM(...)`, any callee position | `{ argRange, varRef? }` — **no `params`** | first arg bare identifier resolves one; anything else (inline array, call expression, ...) doesn't |
| `audio.file` (`AUDIO_FILE_KIND`) | any string/zero-substitution-template literal, at any depth in a call's or `new` expression's arguments, whose value ends in a recognized extension | `{ path: string, pathRange }` | never |

**Rust side** (`sidecar/src/model.rs`): `Finding` is `{id, range, byteRange, #[serde(flatten)] payload: FindingPayload}`, and `FindingPayload` is `#[serde(tag = "kind", content = "payload")]` — the flatten keeps the wire shape exactly `{id, range, byteRange, kind, payload}`, but `kind` and `payload` are now genuinely tied together in the type system instead of independently settable. Match on `Finding::as_zzfx_call()`/`as_zzfxm_song()`/`as_audio_file()` (each returns `Option<&XPayload>`) rather than reaching into `.payload` directly; `Finding::kind()` gives the wire tag string when you just need that.

**TypeScript side** (`src/protocol.ts`): `Finding = ZzfxCallFinding | ZzfxmSongFinding | AudioFileFinding`, discriminated on the shared `kind` literal field. `if (finding.kind !== 'zzfx.call') throw ...` (or an `switch`) before touching `finding.payload`'s zzfx-specific fields — TypeScript won't let you access `payload.params` on the un-narrowed union at all.

**`zzfxm.song` never has a `params` key** — not an empty array, structurally absent — a ZzFXM song is a deeply nested array of arrays, not a flat numeric list; extracting it would just duplicate what the client can already read out of the source text at `argRange`.

**`audio.file`'s "nearest enclosing call" attribution**: a matching string is attributed to the closest ancestor `call_expression`/`new_expression` that owns the `arguments` list it sits in (`enclosing_call_via_arguments` in `parse.rs`), walking through arrays/objects/pairs at any depth but stopping at the FIRST such ancestor. For `foo(bar('x.wav'))` this attributes to `bar(...)`, not the outer `foo(...)` — the closer call is the more useful lens anchor, and stopping at the nearest one avoids re-reporting the same string against every level of call nesting. Multiple audio.file findings can share one `range`/`byteRange` (e.g. Howler's `src: ['a.mp3', 'b.mp3']` produces two findings, both anchored to the same `new Howl(...)` call) — each still gets its own distinct, stable `id` (keyed on the string's own byte range, not the call's).

**`audio.file` covers these library call shapes**, all via the ONE generic string-literal scan — none needed a dedicated scanner:

| Library | Shape |
|---|---|
| three.js | `audioLoader.load('jump.ogg', onLoad)` |
| Howler | `new Howl({ src: ['a.mp3', 'b.ogg'] })` — nested array in object, one finding per string |
| Wad ([rserota/wad](https://github.com/rserota/wad)) | `new Wad({ source: 'jump.wav' })` — same nested-object shape as Howler. Wad's OTHER source mode, synthesis (`source: 'sine'`/`'square'`/etc., no file), has no audio extension and is correctly **not** a finding — a real boundary, pinned by a dedicated negative test (`parse.rs::wad_synthesis_mode_source_has_no_audio_extension_and_is_correctly_not_a_finding`), not an accidental side effect of the extension check. |
| bare `Audio`/`fetch` | `new Audio('x.mp3')`, `fetch('boom.wav')` |
| Tone.js | `Tone.Player('riff.mp3')` |

**Candidate pre-filter** (`sidecar/src/scan.rs::has_audio_candidate`, replacing the old `has_zzfx_candidate`): one combined needle scan for `zzfx` (covers `zzfxm`/`zzfxM` too, since both start with `zzfx` — verified by a dedicated test, not just assumed) and any of `AUDIO_EXTENSIONS` (case-insensitive). `workspace/scan`'s `hasCandidate` boolean stays a single flag — it doesn't report which scanner(s) matched, just "worth a real parse."

**Scanner dispatch** (`parse.rs::walk`): one AST walk produces all three kinds. `call_expression` nodes go through `extract_callee_call`, which looks up the callee name against each callee-based scanner (`zzfx` → `extract_zzfx_call`, `zzfxm`/`zzfxM` → `extract_zzfxm_call`) — adding a fourth callee-based library scanner means adding one more name check there. `string`/qualifying `template_string` nodes go through `extract_audio_file` directly (not callee-driven at all, since audio.file doesn't care what function is being called).

## `varRef.defRange` covers only the value, never the whole declarator

**`def_range` = the initializer VALUE range, i.e. what a write-back replaces — never the whole declarator.** For `zzfx(...somePreset)` / `zzfx(somePreset)` where `somePreset` resolves to a same-file `const`/`let`/`var` declaration, `defRange` (`sidecar/src/parse.rs::resolve_var_ref`) is the range of the declarator's **initializer value node only** — e.g. just `[1, .05, 220]` in `const preset: number[] = [1, .05, 220]` — never the name, any type annotation, or the `=`. This is load-bearing, not cosmetic: a consumer that edits a preset's values by replacing the text at `defRange` would corrupt the declaration (deleting the name and type) if this range were ever widened back to the whole declarator — that was a real bug caught by a branch-wide review before this contract was locked down with the tests below. A declarator with no initializer (`let preset;`) has no value node to point at: `defUri` is still set (there is a real declaration site) but `defRange` is `None` — don't assume the two are always both-or-neither. `payload.varRef`'s initializer need not even be an array literal (`const preset = getPreset()` still reports the call expression's range) — the sidecar reports the range, it doesn't validate the shape; that's the client's job.

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

## Framing — the byte-exact part, and its fatality policy

`src/framing.ts`'s `MessageDecoder` mirrors `sidecar/src/framing.rs` exactly: `Content-Length` counts **UTF-8 bytes**, not `string.length` (UTF-16 code units) — a source file with non-ASCII characters in its `text` param would desync the stream if you count wrong. `encodeMessage`/`MessageDecoder` both work in `Buffer`, not `string`, until the final `JSON.parse`, specifically to keep byte-length arithmetic correct. Don't "simplify" this to string-length counting.

`MessageDecoder.push()` is a streaming reassembler — child process stdout delivers arbitrary chunk boundaries (mid-header, mid-body, multiple messages per chunk). It buffers across `push()` calls; see `src/framing.test.ts` for the boundary cases it's proven against (byte-by-byte delivery, a split landing inside a multi-byte UTF-8 character, etc.).

Header parsing is **strict**, matching `sidecar/src/framing.rs`: a duplicate `Content-Length` header, non-digit garbage after the number, or a declared length over `MAX_MESSAGE_BYTES` (64 MiB, same constant name/value on both sides) is a framing error, not a best-effort guess.

**Two distinct error classes, two distinct policies** — don't conflate them:
- **Message-level** (framing was fine — correct `Content-Length`, byte alignment intact — but the *body* inside that frame isn't valid JSON): caught in `CodelensServiceClient.handleMessage`, routed to `onError`, **non-fatal**. The decoder's position in the stream is still trustworthy, so the next frame reads correctly.
- **Framing-level** (the header itself is missing/duplicated/malformed/too-large — byte alignment with the rest of the stream is lost): `MessageDecoder.push()` throws and **poisons itself** — every subsequent `push()` call throws immediately without touching the buffer, rather than silently re-attempting the same doomed parse forever. `CodelensServiceClient` treats this as **fatal to the whole connection**: it fails every pending request, kills the process, and fires `onExit` with a `(null, null)` sentinel. The Rust sidecar applies the mirror-image policy on its side — `main.rs` exits non-zero on a framing/write error (vs. exit 0 for a clean `shutdown` or the client just closing the pipe), so a supervising client can tell "died from a protocol violation" apart from a normal disconnect.

## Content-hash trust (BLAKE3) and cache correctness

The sidecar's `document/parse` cache-hit decision (`has_fresh_findings` in `sidecar/src/db.rs`) is keyed **solely** on a BLAKE3 content hash of the text (`sidecar/src/hash.rs`) — not a weaker hash, and not `mtime`/`size` (those were dropped as trust signals entirely once the hash became strong enough to trust alone; they were only ever a fragile proxy for "is this the same content," and BLAKE3 equality *is* that, directly). One practical consequence worth knowing: virtual/untitled buffers (no disk file to stat) are now cache-eligible too, which they never were when `mtime`/`size` gated the cache.

If you touch `sidecar/src/db.rs`'s findings-read path, know that `cached_findings`'s SQL has an `ORDER BY rowid` that is **load-bearing, not decorative** — `findings`' actual primary key is `(file_path, id)`, and without an explicit order SQLite is free to scan via that index instead of insertion order, silently returning findings sorted by their (source-position-unrelated) hash-derived `id` instead of source order. This was a real, previously-latent bug: it only manifested for a virtual-file `didChange` → `parse` round trip through the *actual compiled binary with an on-disk cache* — no in-memory, single-shot Rust unit test could force SQLite's query planner into the same choice. The reliable regression guard is `sidecar/tests/integration.rs::did_change_then_parse_preserves_finding_order`; `sidecar/src/db.rs`'s unit-level test for the same thing is kept as documentation of intent, not as a guaranteed red/green oracle.

## Degrade, don't panic

Both sides treat a broken cache as a persistence problem, never a crash:
- **Rust** (`sidecar/src/db.rs`): `Db::open` falls back to an in-memory database — logging, not panicking — if the on-disk file can't be created/opened, **or if it opens but isn't a usable SQLite database at all** (corrupted by an interrupted write, a hostile/garbage file at that path, etc.). Every read/write method past `open()` follows the same rule: log to stderr, return a safe default (`None`/empty/`false`), never `.expect()`-panic. Losing one cache operation just costs a reparse next time, not process stability.
- **TypeScript**: see the framing fatality policy above — a malformed *message body* is similarly non-fatal (logged via `onError`, connection stays alive); only a genuine framing-level desync is treated as unrecoverable.

## Golden interop fixture — the one test that actually catches cross-language drift

`fixtures/golden/golden.ts` + `fixtures/golden/golden.findings.json` are loaded by **both** `sidecar/tests/golden.rs` and `src/goldenFixture.test.ts`, each driving the real compiled binary through the real wire protocol and asserting the exact same expected findings. This is the only test that can catch a `protocol.ts` / `model.rs` drift — `client.test.ts`'s fake-sidecar fixture hand-copies the same shapes this client expects, so it structurally cannot notice a mismatch against what the Rust side actually produces.

`golden.ts` exercises all three kinds: `zzfx.call` (literal + var forms, a type-annotated declarator, an unresolved preset, a member-expression call), `zzfxm.song` (an inline-literal song with no `varRef`, and a named `laserSong` variable that resolves one), and `audio.file` (a direct `new Audio('explosion.mp3')` arg, a Howler-style `new Howl({src: ['ambient.ogg', 'ambient.mp3']})` producing two findings sharing one call's range, a Wad-style `new Wad({source: 'sounds/jump.wav'})`, and — uncommented, so the golden fixture's full-array equality proves the negative rather than implying it — a Wad synthesis-mode `new Wad({source: 'sine'})` that must produce NO finding). Both golden tests slice the *real* fixture source text at the reported `pathRange`/`defRange` and assert byte-equality against the expected value — not just position numbers in isolation — the same discipline `varRef.defRange` already uses.

**Regenerating the golden JSON** (only do this for an intentional protocol/extraction change, and update the expectations in both test files together): drive the built binary over the real wire protocol with a fixed synthetic URI (`file:///golden.ts` — **not** a real disk path; `document/parse`'s `uri` is caller-supplied and doesn't need to correspond to an actual file, and a real path would bake a machine-specific absolute path into `varRef.defUri`, making the fixture non-portable across checkouts/CI). Comparisons on the Rust side deserialize into the typed `Finding` struct, not a generic `serde_json::Value` — `Value`'s equality is JSON-text-format-sensitive (a `Number` parsed from `"1.0"` does not equal one parsed from `"1"`, even though both are the same `f64`), so a naive `Value`-vs-`Value` comparison would spuriously fail depending on incidental number formatting in whatever generated the golden file.

## Tests — five tiers, know which one you're changing

- **`src/framing.test.ts`** — pure unit tests of the framing layer, no process involved. Includes poisoning, duplicate-header rejection, strict-digit rejection, and the `MAX_MESSAGE_BYTES` boundary.
- **`src/resolveBinary.test.ts`** — unit tests of resolution precedence. Uses `includeDevFallback: false` wherever it needs a deterministic "nothing resolves" case — this checkout has a real cargo-built debug binary, so leaving the dev fallback on would make those assertions depend on build state.
- **`src/client.test.ts`** — runs against `src/__fixtures__/fakeSidecar.mjs`, a from-scratch JS reimplementation of just enough of the protocol (including a `--hang-on-shutdown` mode for testing the SIGKILL fallback, a `garbage` method for testing non-fatal message-level `onError`, and a `framingBoom` method for testing the fatal framing-level connection-kill path) to test the client's spawn/framing/lifecycle/request-correlation logic. Fast, no Rust toolchain needed, always runs. If you change the client's plumbing (not the protocol shapes), this is what you're testing against.
- **`src/realSidecar.test.ts`** — spawns the **actual built Rust binary**, driven end-to-end through this package's public API. `beforeAll` runs `cargo build` itself (don't assume a prior build is lying around) then resolves the just-built path. `describe.skipIf(!CARGO_AVAILABLE)`, checked via `spawnSync('cargo', ['--version'])` at module load — **skips with a loud `console.warn`, not fails, if cargo isn't on PATH at all.** Run it locally after touching either side's protocol code — don't assume CI has a Rust toolchain and therefore runs it.
- **`src/goldenFixture.test.ts`** — see "Golden interop fixture" above. Same `CARGO_AVAILABLE` skip/warn pattern; uses a fresh `mkdtemp` working directory (never a path inside `fixtures/`) for its SQLite cache file.

## Common pitfalls

- Editing `src/protocol.ts` without checking `sidecar/src/model.rs` — there's no codegen keeping them in sync; a field rename on one side silently breaks interop (only `realSidecar.test.ts`/`goldenFixture.test.ts` will catch it).
- Adding a new file under `src/` without adding it to `tools/codelens-service/tsup.config.ts`'s `entry` array — `bundle: false` means every cross-imported file needs its own entry (same gotcha as `tools/io`, see `tools/io/CLAUDE.md`).
- Assuming `Content-Length` is a character count — it's bytes. Test with multi-byte content if you touch `framing.ts`.
- Calling `client.scan()`/`client.parse()`/etc. before `await client.start()` — there is no queue, it rejects/throws immediately (by design, see API section above).
- Writing `resolveBinary()` tests without `includeDevFallback: false` when asserting a "not found" case — it'll silently pass or fail depending on whether the sidecar happens to be built in that checkout.
- Treating a message-level error (bad JSON body, good framing) and a framing-level error (bad/duplicate/oversized header) as the same thing — only the latter is connection-fatal. See "Framing — the byte-exact part, and its fatality policy" above.
- Removing `ORDER BY rowid` from `cached_findings`'s query, or adding a new findings-read query without it, because "it looks like it works" in a quick local check — the ordering bug it fixes only manifests through the real compiled binary with an on-disk cache and a delete-then-reinsert cycle, not in a naive in-memory unit test.
- Generating a new golden fixture by hand-editing JSON, or by round-tripping through a language/tool that reformats numbers (e.g. `JSON.stringify` in Node, which collapses `1.0` to `1`) — regenerate it by actually running the built binary, and compare via typed structs (Rust) / plain `JSON.parse` (TS), not raw JSON-text diffing.
- Regenerating the golden fixture with a real disk path instead of the fixed `file:///golden.ts` synthetic URI — bakes a machine-specific absolute path into `varRef.defUri`, breaking the fixture on any other checkout.
- Reaching into `finding.payload.X` without narrowing on `finding.kind` first (TS) or matching on `FindingPayload`/using `Finding::as_*` (Rust) — `payload`'s shape genuinely differs per kind now; there is no field that exists on all three.
- Adding a fifth string-bearing scanner case and forgetting `enclosing_call_via_arguments` stops at the NEAREST `arguments` ancestor by design — don't "fix" it to walk to the outermost call, that reintroduces double-reporting for nested calls.

## Reference

- Sidecar protocol source of truth: `sidecar/src/model.rs`, `sidecar/src/handlers.rs`, `sidecar/src/rpc.rs`.
- Scanners: `sidecar/src/parse.rs` (all three kinds, one AST walk), `sidecar/src/scan.rs` (candidate pre-filter, `AUDIO_EXTENSIONS`).
- Client: `src/client.ts`. Protocol types: `src/protocol.ts`. Framing: `src/framing.ts`. Binary resolution: `src/resolveBinary.ts`.
- Rust cache: `sidecar/src/db.rs` (degrade-not-panic, content-hash trust, `ORDER BY rowid`). Rust content hashing: `sidecar/src/hash.rs`. Rust exit-code policy: `sidecar/src/main.rs`.
- Golden fixture: `fixtures/golden/golden.ts`, `fixtures/golden/golden.findings.json`, `sidecar/tests/golden.rs`, `src/goldenFixture.test.ts`.
