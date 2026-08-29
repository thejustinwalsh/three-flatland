# Router lifecycle

`run` returns a managed process PID. Store it with the selected provider/model, absolute worktree, target commit, and prompt identity. The process can finish while the MCP client is disconnected; its result remains queryable through `get_result`.

Use `peek` as an observation window, not as a log reader. It can miss events between calls and deliberately omits raw command output. Use `wait` for one or more PIDs when coordinating a batch, then use `get_result` with `verbose: true` when metadata or the full parsed result is needed.

Resume by passing the returned `session_id` back to `run`. For OpenCode this is an in-place `--session` resume; for Claude and Codex it maps to their provider-specific resume flags. Keep the same model and worktree unless the new prompt explicitly records why either changed.

`kill_process` is cancellation, not failure recovery. Before killing a process, capture its current result and classify the failure. A provider outage is resumable; a bad prompt, invalid model, missing login, or dirty/mis-scoped worktree needs correction before another run.

`list_processes` enumerates runs the server still tracks. Prefer the run manifest in `.cache/side-piece/` as the authoritative record of what this repository started, because server-side state is scoped to the host and its normalized working directory.

## Where run state lives

The CLI façade and the MCP server share one on-disk state root:

```
~/.local/state/ai-cli/cwds/<normalized-cwd>/<pid>/
├── meta.json
├── stdout.log
├── stderr.log
└── exit-status.json
```

`<normalized-cwd>` is derived from the `--cwd`/`workFolder` you passed, so a run started against one worktree is not visible from a differently normalized path. Always record the absolute worktree in the manifest alongside the PID.
