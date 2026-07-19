import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register'
import { registerMergeTool } from './tools/merge/register'
import { registerEncodeTool } from './tools/encode/register'
import { registerNormalBakerTool } from './tools/normal-baker/register'
import { registerAudioTool } from './tools/audio/register'
import { TOOL_META, type ToolMeta, isEnabled } from './toolEnabled'
import { decideToolConfigAction } from './toolRegistryDecisions'
import { log } from './log'

/**
 * Register-function wiring + activate/watch lifecycle for the extension's tools.
 *
 * Tool metadata and `isToolEnabled` live in `./toolEnabled` (the leaf) so that
 * `tools/<name>/register.ts` can read enablement WITHOUT importing back into
 * this module — this module imports each `register*Tool`, so the reverse edge
 * would be a `toolRegistry -> register -> toolRegistry` cycle. Adding a tool =
 * one entry in `TOOL_META` (toolEnabled.ts) + its register function keyed by id
 * in `REGISTER_BY_ID` below.
 */
type ToolDescriptor = ToolMeta & {
  /**
   * Registers the tool and returns ONE aggregate `Disposable` covering
   * everything it created — the registry pushes this to `context.subscriptions`
   * (deactivate-time cleanup) and separately holds onto it for live per-tool
   * disposal. Each `register*Tool` collects its own disposables and returns
   * `vscode.Disposable.from(...)` rather than pushing to `context.subscriptions`
   * directly, so ownership stays with the registry.
   */
  register: (context: vscode.ExtensionContext) => vscode.Disposable
}

const REGISTER_BY_ID: Record<string, ToolDescriptor['register']> = {
  spriteAtlas: registerAtlasTool,
  imageEncoder: registerEncodeTool,
  atlasMerge: registerMergeTool,
  audio: registerAudioTool,
  normalBaker: registerNormalBakerTool,
}

const TOOL_DESCRIPTORS: ToolDescriptor[] = TOOL_META.map((meta) => {
  const register = REGISTER_BY_ID[meta.id]
  if (!register) {
    throw new Error(`toolRegistry: no register function wired for tool id '${meta.id}'`)
  }
  return { ...meta, register }
})

const live = new Map<string, vscode.Disposable>()

function setContext(descriptor: ToolDescriptor, enabled: boolean): void {
  void vscode.commands.executeCommand('setContext', descriptor.contextKey, enabled)
}

/**
 * Registers every enabled tool, sets each `contextKey` regardless of
 * enabled state (so `when` clauses always have a defined value, not
 * `undefined`-is-falsy-by-accident), and pushes each tool's aggregate
 * disposable to `context.subscriptions` for deactivate-time cleanup.
 */
export function activateTools(context: vscode.ExtensionContext): void {
  for (const descriptor of TOOL_DESCRIPTORS) {
    const enabled = isEnabled(descriptor)
    setContext(descriptor, enabled)
    if (!enabled) {
      log(`toolRegistry: ${descriptor.label} disabled at startup (${descriptor.settingKey})`)
      continue
    }
    try {
      const disposable = descriptor.register(context)
      live.set(descriptor.id, disposable)
      context.subscriptions.push(disposable)
    } catch (err) {
      // Isolate per tool: one tool's registration throwing (e.g. a viewType
      // collision) must not reject activate() and take the whole suite down.
      // Log + skip it; the other tools still register.
      log(
        `toolRegistry: ${descriptor.label} failed to register — skipping. ` +
          (err instanceof Error ? (err.stack ?? err.message) : String(err))
      )
    }
  }
}

/**
 * Watches `threeFlatland.tools.*.enabled` and reacts per tool:
 * - Turning ON a `liveToggle` tool that isn't registered → registers it
 *   now (commands/panels are cheap to stand up mid-session).
 * - Turning OFF a `liveToggle` tool that is registered → disposes its
 *   aggregate disposable now.
 * - Either direction on a non-`liveToggle` tool → the context key still
 *   flips immediately (menus/palette react right away), but the actual
 *   register/dispose is deferred to next activation — a
 *   "Reload Window" prompt is the honest way to say that, rather than
 *   leaving a half-torn-down CodeLens provider + sidecar pair running.
 */
export function watchToolConfiguration(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      for (const descriptor of TOOL_DESCRIPTORS) {
        if (!e.affectsConfiguration(descriptor.settingKey)) continue
        const enabled = isEnabled(descriptor)
        const wasLive = live.has(descriptor.id)
        const action = decideToolConfigAction({
          enabled,
          wasLive,
          liveToggle: descriptor.liveToggle,
        })

        // Unconditional, BEFORE the noop check below: the context key
        // must always mirror the current setting value, not just the
        // register/dispose action taken. A non-liveToggle tool toggled
        // off then back on (before reloading) never re-registers — `live`
        // still has its stale entry from before the disable, so `wasLive`
        // reads true again and the action correctly comes back 'noop' —
        // but the context key was flipped to `false` on the way down and
        // needs flipping back to `true` on the way up, or menus/palette
        // stay hidden despite isToolEnabled() (which reads the setting
        // directly, not this mirror) correctly allowing the command.
        setContext(descriptor, enabled)

        if (action === 'noop') continue

        if (action === 'register') {
          // Isolate, same as activateTools: a throw here would crash the
          // onDidChangeConfiguration handler and stop later tools in this loop
          // from reacting to the same config change.
          try {
            const disposable = descriptor.register(context)
            live.set(descriptor.id, disposable)
            context.subscriptions.push(disposable)
            log(`toolRegistry: ${descriptor.label} enabled live`)
          } catch (err) {
            log(
              `toolRegistry: ${descriptor.label} failed to register live — skipping. ` +
                (err instanceof Error ? (err.stack ?? err.message) : String(err))
            )
          }
        } else if (action === 'dispose') {
          const disposable = live.get(descriptor.id)
          try {
            disposable?.dispose()
          } catch (err) {
            log(`toolRegistry: ${descriptor.label} failed to dispose cleanly: ${String(err)}`)
          }
          live.delete(descriptor.id)
          // Also drop it from context.subscriptions (it was pushed there on
          // register): leaving disposed entries accumulates them across every
          // off/on cycle and double-disposes each at deactivate().
          if (disposable) {
            const i = context.subscriptions.indexOf(disposable)
            if (i !== -1) context.subscriptions.splice(i, 1)
          }
          log(`toolRegistry: ${descriptor.label} disabled live`)
        } else {
          // 'reload-prompt-enable' | 'reload-prompt-disable' — context key
          // already flipped above; the actual register/dispose waits for
          // reload rather than risking a live re-register racing an
          // in-flight sidecar shutdown (zzfx's CodeLens provider + two
          // external sidecar processes).
          void vscode.window
            .showInformationMessage(
              `${descriptor.label} ${enabled ? 'enabled' : 'disabled'} — reload the window to apply.`,
              'Reload Window'
            )
            .then((choice) => {
              if (choice === 'Reload Window') {
                void vscode.commands.executeCommand('workbench.action.reloadWindow')
              }
            })
        }
      }
    })
  )
}
