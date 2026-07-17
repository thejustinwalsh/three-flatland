import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register'
import { registerMergeTool } from './tools/merge/register'
import { registerEncodeTool } from './tools/encode/register'
import { registerNormalBakerTool } from './tools/normal-baker/register'
import { registerAudioTool } from './tools/audio/register'
import { decideToolConfigAction } from './toolRegistryDecisions'
import { log } from './log'

/**
 * Single point of extension for "which tools does this extension ship,
 * and can each be turned off." Adding a tool means ONE new entry here —
 * its own `contributes.configuration` property in package.json, and any
 * menu items gated on `contextKey` — not scattered edits across
 * `extension/index.ts`.
 */
export type ToolDescriptor = {
  /** Short id — the `tools.<id>.enabled` segment of `settingKey`. */
  id: string
  /** Full `threeFlatland.tools.<id>.enabled` config key. */
  settingKey: string
  /** `threeFlatland.tool.<id>.enabled` — mirrored into `setContext` so
   * `when` clauses (menus, command `enablement`) can gate on it. */
  contextKey: string
  /** Human label for reload/status messages. */
  label: string
  /**
   * Whether flipping the setting mid-session can register/dispose the
   * tool live. `false` tools (audio: a CodeLens provider with a debounced
   * document-change listener, plus two external sidecar processes with
   * async spawn/shutdown lifecycles) prompt for a window reload instead —
   * safer than risking a live re-register racing an in-flight sidecar
   * shutdown.
   */
  liveToggle: boolean
  /**
   * Registers the tool and returns ONE aggregate `Disposable` covering
   * everything it created — the registry pushes this to
   * `context.subscriptions` (deactivate-time cleanup) and separately
   * holds onto it for live per-tool disposal. Each `register*Tool`
   * function collects its own disposables into an array and returns
   * `vscode.Disposable.from(...)` instead of pushing directly to
   * `context.subscriptions`, so ownership stays with the registry.
   */
  register: (context: vscode.ExtensionContext) => vscode.Disposable
}

export const TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    id: 'spriteAtlas',
    settingKey: 'threeFlatland.tools.spriteAtlas.enabled',
    contextKey: 'threeFlatland.tool.spriteAtlas.enabled',
    label: 'FL Sprite Atlas',
    liveToggle: true,
    register: registerAtlasTool,
  },
  {
    id: 'imageEncoder',
    settingKey: 'threeFlatland.tools.imageEncoder.enabled',
    contextKey: 'threeFlatland.tool.imageEncoder.enabled',
    label: 'FL Image Encoder',
    liveToggle: true,
    register: registerEncodeTool,
  },
  {
    id: 'atlasMerge',
    settingKey: 'threeFlatland.tools.atlasMerge.enabled',
    contextKey: 'threeFlatland.tool.atlasMerge.enabled',
    label: 'FL Atlas Merge',
    liveToggle: true,
    register: registerMergeTool,
  },
  {
    id: 'audio',
    settingKey: 'threeFlatland.tools.audio.enabled',
    contextKey: 'threeFlatland.tool.audio.enabled',
    label: 'FL Audio',
    liveToggle: false,
    register: registerAudioTool,
  },
  {
    id: 'normalBaker',
    settingKey: 'threeFlatland.tools.normalBaker.enabled',
    contextKey: 'threeFlatland.tool.normalBaker.enabled',
    label: 'FL Normal Baker',
    // Ad-hoc webview panel + in-process Node bake calls (imports
    // @three-flatland/normals/@three-flatland/bake directly) — no
    // CodeLens provider, no external sidecar process, same shape as
    // atlas/encode/merge. Safe to register/dispose live.
    liveToggle: true,
    register: registerNormalBakerTool,
  },
]

function isEnabled(descriptor: ToolDescriptor): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(descriptor.settingKey, true)
}

/** Read directly by a command callback for the "defense in depth against
 * a keybinding bypassing a hidden menu item" guard — see each
 * `register*Tool`'s command callbacks. */
export function isToolEnabled(id: string): boolean {
  const descriptor = TOOL_DESCRIPTORS.find((d) => d.id === id)
  return descriptor ? isEnabled(descriptor) : true
}

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
          const disposable = descriptor.register(context)
          live.set(descriptor.id, disposable)
          context.subscriptions.push(disposable)
          log(`toolRegistry: ${descriptor.label} enabled live`)
        } else if (action === 'dispose') {
          live.get(descriptor.id)?.dispose()
          live.delete(descriptor.id)
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
