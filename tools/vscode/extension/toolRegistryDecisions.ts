// Pure decision logic for `toolRegistry.ts`'s `onDidChangeConfiguration`
// handler, split out so it's unit-testable without the `vscode` module
// (which can't be loaded by plain vitest — see `sidecar.ts`'s equivalent
// split in the normal-baker workstream for the same reason).

export type ToolConfigAction =
  /** Setting didn't actually change the enabled/registered state — ignore. */
  | 'noop'
  /** `liveToggle` tool turning on and not yet registered — register now. */
  | 'register'
  /** `liveToggle` tool turning off while registered — dispose now. */
  | 'dispose'
  /** Non-`liveToggle` tool turning on — context key flips now, register waits for reload. */
  | 'reload-prompt-enable'
  /** Non-`liveToggle` tool turning off — context key flips now, teardown waits for reload. */
  | 'reload-prompt-disable'

export function decideToolConfigAction(params: {
  enabled: boolean
  wasLive: boolean
  liveToggle: boolean
}): ToolConfigAction {
  const { enabled, wasLive, liveToggle } = params
  if (enabled === wasLive) return 'noop'
  if (!liveToggle) return enabled ? 'reload-prompt-enable' : 'reload-prompt-disable'
  return enabled ? 'register' : 'dispose'
}
