---
name: side-piece
description: Route resumable external-model work through the pinned side-piece MCP server. Use for adversarial reviews, implementation reviews, research, and one-off delegated tasks when the user names Claude, Opus, Fable, Sonnet, Haiku, Codex, GPT-5, Sol, Terra, Luna, Spark, Gemini, Forge, OpenCode, or asks for an external model, a second opinion, or a review by another agent.
license: MIT
metadata:
  package: "@tjw.dev/side-piece"
  homepage: https://tjw.dev/side-piece
---

# side-piece

Route external-model work through the project's `side-piece` MCP server. Do not launch provider CLIs directly when the server can do the job: it owns background process tracking, session IDs, result retrieval, and provider-specific argument validation.

Every run is resumable. Start it with `run`, retain the returned PID, use `peek` only for a bounded progress sample, use `wait` or `get_result` for the authoritative outcome, and resume with the returned `session_id` when a provider fails or the user asks for another pass. A one-off task is still started in the background; `wait` immediately afterward is the blocking recipe.

**Resuming.** Resume when the prompt continues the same thread against the same target: that keeps the model's own reasoning in play, so it defends what it argued rather than agreeing with your summary of it. Start fresh when the target or the kind of work changed, or when a long session has sat idle long enough to lose its cache — resending a cold transcript costs more than it saves. Unsure: ask.

## Reach for the MCP tools first

The `side-piece` server puts its tools in your registry with their own schemas. **Use those.** They are the primary interface, they are already described to you, and nothing here restates them.

Drop to the `side-piece` command only when those tools are genuinely not present — a client that has not reloaded since install is the usual reason. That path is a fallback, not a preference: mark such runs `transport: cli-fallback`, keep trying to restore MCP visibility, and never report MCP as healthy because the fallback worked.

When you do use the command line, use `side-piece`, never the underlying server's own binary. `side-piece` is the stable surface; what runs beneath it can be replaced without invalidating anything written here.

Never call a provider CLI directly. Neither path is a licence to run `claude`, `codex`, or `opencode` yourself — doing so loses process tracking, the session ID, and every guarantee in this document.

## Setup and health check

Before using a new checkout or machine:

1. Run `npx side-piece doctor`. One command covers skill placement, every client's MCP entry, the resolved server version, and which provider binaries are on `PATH`. Every line must read `ok`.
2. Reload or restart the MCP client. Servers are read at startup, so a correct install does nothing until it restarts — this is the most common reason a clean setup appears broken.
3. Confirm the `side-piece` tools are in your active registry. If they are absent, inspect Codex with `codex mcp get side-piece` and Claude with `claude mcp get side-piece`, then reload. A missing server is a setup failure, not a reason to proceed on the fallback.
4. Smoke it: one small background run in an isolated temporary worktree, waited on, returning a non-empty result with a session ID. Resume that session with a second tiny prompt before calling the router healthy.

`doctor` proves binaries exist. It does **not** prove login, terms acceptance, or quota — check those with each provider's own status command when a run depends on them. Claude additionally requires one manual `claude --dangerously-skip-permissions` run to accept terms before anything can drive it.

### The fallback command surface

Unlike the MCP tools, these names are not self-describing, so they are listed here in full. Flags are as the server accepts them:

```bash
npx side-piece models                       # the routing catalog
npx side-piece providers                    # provider binaries on PATH
npx side-piece run --cwd <abs> --model <m> [--prompt <text> | --prompt-file <abs>]
                   [--reasoning-effort <level>] [--session-id <id>]
npx side-piece wait <pid...> [--timeout <sec>] [--verbose]
npx side-piece peek <pid...> [--time <sec>] [--include-tool-calls]
npx side-piece result <pid> [--verbose]
npx side-piece ps                           # runs this host still tracks
npx side-piece kill <pid>                   # cancellation, not recovery
npx side-piece cleanup                      # forget completed and failed runs
npx side-piece exec <args...>               # anything else, forwarded verbatim
```

`--cwd` here is the same thing the MCP `run` tool calls `workFolder`; the CLI and the tools name several things differently, so do not carry a flag from one into the other.

`npx side-piece doctor` is ours rather than the server's: it checks skill placement and every client's MCP entry, then folds in the provider report. `peek` defaults to a 10 second window and caps at 60.

This shares the same server-side process state, so runs stay resumable. Capture the PID, provider/model, absolute worktree, target commit, and returned `session_id`; resume with `run --session-id <session_id>`. Label the run `transport: cli-fallback` and keep trying to restore MCP visibility. Never replace this with a globally installed provider CLI, and never claim MCP is healthy because the fallback succeeded.

## Route from facts, not guesses

An explicit user model choice always wins over a task-based preference. The router may recommend a model when the user leaves it open, but it must not substitute a preferred model after the user names one. It still validates the requested name against the live catalog and reports an unavailable or malformed route instead of silently changing providers.

**Always call `models` before selecting.** Provider catalogs change between releases, and preview and free tiers rotate quickly. Any model name written down in this file is an example, not a guarantee — a name that worked last month may be gone. Treat the live response as the only catalog.

The response groups models by agent (`claude`, `codex`, `gemini`, `forge`, `opencode`), lists `aliases` that resolve to a model *and* an effort, and describes `dynamicModelBackends` for providers whose catalogs are discovered at runtime.

Routing is by prefix: `gpt-` goes to Codex, `gemini` to Gemini, `forge` to Forge, `opencode` and `oc-` to OpenCode, and **everything else falls through to Claude**. That fall-through is why an unvalidated typo silently becomes a Claude request.

### Users speak in shorthand; resolve it against the catalog

People say `opus`, `sol`, `mimo`. Those are not always the values the server accepts. Resolving them is this skill's job, and it is a lookup against the live catalog, never a guess:

1. Call `models`. For an OpenCode route, also run `opencode models` — that catalog is dynamic and the `models` response only reports the rule for it.
2. Case-insensitively match the user's word against every candidate name.
3. **Exactly one match** — route to it.
   **More than one** — ask which; never pick the first.
   **None** — say so and show the near misses. Do not fall through to a default.

The fall-through rule makes step 3 non-negotiable: an unrecognized name is not rejected by the server, it is sent to **Claude**. A typo becomes a silent Claude request.

| User says | Provider | Passed as | Rule |
| --- | --- | --- | --- |
| `opus`, `sonnet`, `haiku` | Claude | the same word | Already catalog names. `reasoning_effort: high`. |
| `sonnet 1m`, `long context` | Claude | `sonnet[1m]` | The brackets are part of the name. |
| `opusplan`, `plan with opus` | Claude | `opusplan` | Opus plans, a cheaper model executes. |
| `fable` | Claude | `fable` | Explicit request only, never auto-selected. May require usage credits. |
| `sol`, `terra`, `luna` | Codex | the `gpt-5.6-*` entry containing that word | `terra` has two `r`s; accept `tera` as a typo for it. |
| `spark` | Codex | `gpt-5.3-codex-spark` | Fast tier. Do not confuse with `gpt-5.3-codex`. |
| a `gpt-` name | Codex | the same word | Validate against the catalog. |
| a `gemini` name | Gemini | the same word | Omit `reasoning_effort`. |
| `mimo`, `nemotron`, `pickle`, … | OpenCode | the unique `opencode/*` match, prefixed `oc-` | Discovered, not listed — see below. Omit `reasoning_effort`. |
| `ultra`, `max effort`, `hardest` | as chosen | the matching `*-ultra` alias | The alias sets its own effort; do not also pass `reasoning_effort`. **Confirm before running — see Effort.** |
| `claude:<model>`, `codex:<model>` | as named | the suffix | Validate the suffix against the catalog. |

Naming a model always beats the router's own preference. Report an unavailable route rather than substituting one.

### OpenCode models are discovered, not listed

OpenCode's catalog is dynamic and its free and preview slots rotate. `models` reports only the configured default, `opencode`, plus the rule for explicit names. Discover the rest:

```bash
opencode models          # the authoritative list
```

Then translate the provider-native identifier by prefixing `oc-`: a user asking for `mimo` resolves against that list to `opencode/mimo-v2.5-free`, which is passed as `oc-opencode/mimo-v2.5-free`. The prefix is required and the pattern is exact — a malformed value is rejected rather than coerced. Never route to an OpenCode model you have not just seen in that list, and never carry one of these names forward from a previous session.

### Effort

Default every Claude and Codex route to `reasoning_effort: high`. That is the highest tier the router selects on its own, for any model, on any task.

#### Above `high`, stop and confirm

**Never start a run above `high` without a second, explicit confirmation from the user.** This covers `xhigh`, `max`, `ultra`, and every `*-ultra` alias — the aliases set `max` or `ultra` themselves, so choosing one crosses this line even though no effort field was written.

Before such a run, state the model, the exact tier, and why it is warranted. Then wait for a direct answer. Treat the following as **not** confirmation:

- the user naming an expensive or flagship model;
- the task being hard, large, security-sensitive, or important;
- encouragement like *be thorough*, *do your best*, *take your time*, *really dig in*;
- an approval given earlier in the session for a different run;
- your own judgement that the result would be better.

A request phrased as *"use ultra"* is the **first** signal, not the confirmation. Read it back — *"that is Opus at max effort, which costs materially more than high; confirm?"* — and wait. One confirmation authorises one run. A resumed session at the same tier is a new run and needs its own.

If the user declines or does not answer, run at `high` and say that is what you did.

#### Accepted values

Tiers are provider- and model-specific, and the server rejects anything outside them:

| Provider | Accepted `reasoning_effort` |
| --- | --- |
| Claude | `low`, `medium`, `high`, `xhigh`, `max` |
| Codex, all models | `low`, `medium`, `high`, `xhigh` |
| Codex `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` | additionally `max` |
| Codex `gpt-5.6-sol`, `gpt-5.6-terra` | additionally `ultra` |
| Gemini, Forge, OpenCode | omit the field |

Never substitute or silently retry at a different tier when a requested one is rejected; report the rejection and the accepted set. Lowering effort below `high` needs no confirmation, but say that you did it.

## Review recipe

For an adversarial review:

1. Resolve the model with `models` and choose the requested provider explicitly.
2. Use an absolute isolated worktree as `workFolder`; include the target commit, review scope, acceptance criteria, and the instruction to report evidence with file and line references.
3. Call `run` with the review prompt. Do not give a review agent a mutation mandate. The wrapper bypasses provider permission prompts, so isolation and a clean worktree are the safety boundary.
4. Record PID, session ID, provider, model, worktree, target commit, status, and the **timestamp of the last turn** in the ignored `.cache/side-piece/` run manifest.
5. Use `peek` for a short progress sample only. Use `wait` or `get_result` to collect the complete result.
6. On a transient provider failure, call `run` again with the same `session_id` and worktree. Do not start a fresh session unless the original is unrecoverable.
7. After integration changes, run a new review against the new commit; do not ask a stale session to review a different checkout without stating the new target.

For parallel reviews, start all runs first, then wait on their PIDs together. Keep each worktree and manifest distinct. A successful process exit is not proof of a useful review; require a structured report and inspect the cited source.

## Implementation recipe

Use the same lifecycle for delegated implementation, but make the prompt explicitly mutation-authorized and name the exact branch and worktree. Require the agent to preserve repository instructions, run the narrow gate, and commit only its coherent slice. Review and integrate the result locally before running external review or broader checks.

## Configuration

| Client | File | Key |
| --- | --- | --- |
| Claude Code | `.mcp.json` | `mcpServers.side-piece` |
| Codex | `.codex/config.toml` | `[mcp_servers.side-piece]` |
| opencode | `opencode.json` | `mcp.side-piece` |

All three run `side-piece-mcp` through the project's package manager. `tool_timeout_sec` controls the maximum individual MCP call, not server lifetime; the checked-in Codex value is one hour so a long `wait` can stay attached while the server remains a normal stdio process.

Run lifecycle details are in [references/lifecycle.md](references/lifecycle.md); how to read the catalog response is in [references/model-catalog.md](references/model-catalog.md).
