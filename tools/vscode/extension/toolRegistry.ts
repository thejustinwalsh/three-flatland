import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register'
import { registerMergeTool } from './tools/merge/register'
import { registerEncodeTool } from './tools/encode/register'
import { registerZzfxTool } from './tools/zzfx/register'
import { decideToolConfigAction } from './toolRegistryDecisions'
import { log } from './log'

/**
 * Single point of extension for "which tools does this extension ship,
 * and can each be turned off." Adding a tool (normal-baker's future PR
 * included) means ONE new entry here — its own `contributes.configuration`
 * property in package.json, and any menu items gated on `contextKey` — not
 * scattered edits across `extension/index.ts`.
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
   * tool live. `false` tools (zzfx: a CodeLens provider with a debounced
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
    id: 'zzfxStudio',
    settingKey: 'threeFlatland.tools.zzfxStudio.enabled',
    contextKey: 'threeFlatland.tool.zzfxStudio.enabled',
    label: 'FL ZzFX Studio',
    liveToggle: false,
    register: registerZzfxTool,
  },
  // normal-baker (feat/normal-baker-gui, not yet merged): add one entry
  // here — id 'normalBaker', settingKey
  // 'threeFlatland.tools.normalBaker.enabled' — plus the matching
  // package.json `contributes.configuration` property and
  // `1_authoring@2` explorer/context menu slot (see package.json's
  // comment-equivalent in tools/vscode/CLAUDE.md once that PR lands).
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
    const disposable = descriptor.register(context)
    live.set(descriptor.id, disposable)
    context.subscriptions.push(disposable)
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
        if (action === 'noop') continue

        setContext(descriptor, enabled)

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
