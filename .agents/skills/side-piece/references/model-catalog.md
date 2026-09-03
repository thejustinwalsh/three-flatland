# Reading the model catalog

The router does not own a permanent copy of provider availability. Query `models` at the start of a run and treat this page as the interpretation of the catalog response shape.

## Naming

The router uses direct names for Claude, Codex, and Gemini. `forge` is a provider key rather than a model-family selector. OpenCode has a configured-default name, `opencode`, and dynamic explicit names carrying the `oc-` prefix. A provider-native name such as `opencode/big-pickle` therefore becomes `oc-opencode/big-pickle` at the router boundary; the prefix is required and the pattern is exact, so a malformed value is rejected rather than coerced. That name is an illustration, not a fixture — OpenCode rotates its free and preview slots, so resolve against `opencode models` at routing time and never carry one forward from a previous session.

Model names route to providers by prefix: anything starting with `gpt-` is Codex, anything starting with `gemini` is Gemini, `forge` is Forge, `opencode`/`oc-` is OpenCode, and everything else falls through to Claude. That fall-through is why an unvalidated typo silently becomes a Claude request — check the catalog before routing.

## Aliases

Three aliases resolve to a model *and* an effort in one step:

| Alias | Resolves to | Agent | Effort it sets |
| --- | --- | --- | --- |
| `claude-ultra` | `opus` | claude | `max` |
| `codex-ultra` | `gpt-5.6-sol` | codex | `ultra` |
| `gemini-ultra` | `gemini-3.1-pro-preview` | gemini | — |

`claude-ultra` does not select Fable. All three aliases cross the confirmation threshold, because each sets its own effort at or above `max`. Because an alias carries its own effort, passing `reasoning_effort` alongside one is redundant at best and a conflicting request at worst.

## Effort ceilings

Reasoning is provider- and model-specific, and the server validates it:

- Claude accepts `low`, `medium`, `high`, `xhigh`, `max`.
- Codex accepts `low`, `medium`, `high`, `xhigh` for every model.
- Codex additionally accepts `max` for `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- Codex additionally accepts `ultra` for `gpt-5.6-sol` and `gpt-5.6-terra` only. `gpt-5.6-luna` stops at `max`.
- Gemini, Forge, and OpenCode take no `reasoning_effort` through this integration.

Router policy defaults every Claude and Codex route to `high`. Any tier above `high` — `xhigh`, `max`, `ultra`, or a `*-ultra` alias — requires an explicit second confirmation from the user before the run starts, and one confirmation authorises one run. Model choice, task difficulty, and encouragement to be thorough never raise effort on their own. See the Effort section of SKILL.md for the full rule.

## Fable

`fable` is a first-class entry in the Claude list as of `2.22.0`. It is an explicit selection: never auto-select it, never alias it to Opus, and expect that it may require usage credits on the host account. Earlier notes describing Fable as an undocumented pass-through are stale.
