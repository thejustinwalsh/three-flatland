import * as vscode from 'vscode'

/**
 * Tool metadata + enablement check — the LEAF half of the tool registry.
 *
 * Split out of `toolRegistry.ts` so that `tools/<name>/register.ts` can call
 * `isToolEnabled()` WITHOUT an import cycle: `toolRegistry.ts` imports each
 * `register*Tool` function, so if a `register.ts` imported back into
 * `toolRegistry.ts` you'd get `toolRegistry -> register -> toolRegistry`.
 * This module imports nothing from the tools, so it stays a leaf.
 */
export type ToolMeta = {
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
   * Whether flipping the setting mid-session can register/dispose the tool
   * live. `false` tools (audio: a CodeLens provider with a debounced
   * document-change listener plus external sidecar processes) prompt for a
   * window reload instead — safer than a live re-register racing an in-flight
   * sidecar shutdown.
   */
  liveToggle: boolean
}

/**
 * The tools this extension ships and whether each can be turned off. Adding a
 * tool means ONE entry here + its register function in `toolRegistry.ts`'s
 * `REGISTER_BY_ID` + a `contributes.configuration` property in package.json.
 */
export const TOOL_META: ToolMeta[] = [
  {
    id: 'spriteAtlas',
    settingKey: 'threeFlatland.tools.spriteAtlas.enabled',
    contextKey: 'threeFlatland.tool.spriteAtlas.enabled',
    label: 'FL Sprite Atlas',
    liveToggle: true,
  },
  {
    id: 'imageEncoder',
    settingKey: 'threeFlatland.tools.imageEncoder.enabled',
    contextKey: 'threeFlatland.tool.imageEncoder.enabled',
    label: 'FL Image Encoder',
    liveToggle: true,
  },
  {
    id: 'atlasMerge',
    settingKey: 'threeFlatland.tools.atlasMerge.enabled',
    contextKey: 'threeFlatland.tool.atlasMerge.enabled',
    label: 'FL Atlas Merge',
    liveToggle: true,
  },
  {
    id: 'audio',
    settingKey: 'threeFlatland.tools.audio.enabled',
    contextKey: 'threeFlatland.tool.audio.enabled',
    label: 'FL Audio',
    liveToggle: false,
  },
  {
    id: 'normalBaker',
    settingKey: 'threeFlatland.tools.normalBaker.enabled',
    contextKey: 'threeFlatland.tool.normalBaker.enabled',
    label: 'FL Normal Baker',
    liveToggle: true,
  },
]

export function isEnabled(meta: ToolMeta): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(meta.settingKey, true)
}

/**
 * Read directly by a command callback for the "defense in depth against a
 * keybinding bypassing a hidden menu item" guard — see each `register*Tool`'s
 * command callbacks. Reads the setting directly (not the `setContext` mirror).
 */
export function isToolEnabled(id: string): boolean {
  const meta = TOOL_META.find((m) => m.id === id)
  return meta ? isEnabled(meta) : true
}
