import * as stylex from '@stylexjs/stylex'
import { Button, Panel } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { ZzfxGenerateResult } from './protocol'

// Ship kill-switch for the whole AI Generate feature. The host-side
// vscode.lm service (extension/tools/zzfx/lmService.ts) and this panel
// are both implemented (#148 Z5); Z3 wires `bridge.on('zzfx/generate', ...)`
// into a live panel. Flip to `false` to hide the panel entirely without
// reverting either side.
export const AI_GENERATE_ENABLED = true

const s = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  description: {
    fontSize: '11px',
    color: vscode.descriptionFg,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
  },
  stream: {
    maxHeight: 72,
    overflow: 'auto',
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    color: vscode.descriptionFg,
    backgroundColor: vscode.inputBg,
    border: `1px solid ${vscode.inputBorder}`,
    borderRadius: radius.sm,
    padding: space.sm,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  badge: {
    fontSize: '11px',
    color: vscode.descriptionFg,
  },
  error: {
    fontSize: '11px',
    color: vscode.errorFg,
  },
})

function sourceLabel(source: ZzfxGenerateResult['source']): string {
  if (source === 'lm') return 'Applied — generated via AI'
  if (source === 'cache') return 'Applied — cached AI result'
  return 'Applied — curated preset (AI unavailable or declined)'
}

export type AiGeneratePanelProps = {
  standalone: boolean
  generating: boolean
  generateError: string | null
  generateStream: string
  lastGenerateSource: ZzfxGenerateResult['source'] | null
  onGenerate: () => void
}

export function AiGeneratePanel({
  standalone,
  generating,
  generateError,
  generateStream,
  lastGenerateSource,
  onGenerate,
}: AiGeneratePanelProps) {
  if (!AI_GENERATE_ENABLED) return null
  return (
    <Panel title="AI Generate">
      <div {...stylex.props(s.body)}>
        <p {...stylex.props(s.description)}>
          Generates a param set from the category + style pills above, via the editor's language
          model — falls back to a curated preset when no model is available.
        </p>
        <div {...stylex.props(s.row)}>
          <Button onClick={onGenerate} disabled={standalone || generating}>
            {generating ? 'Generating…' : '✨ Generate'}
          </Button>
          {!generating && lastGenerateSource && (
            <span {...stylex.props(s.badge)}>{sourceLabel(lastGenerateSource)}</span>
          )}
        </div>
        {standalone && (
          <p {...stylex.props(s.description)}>Connect to a host to use AI Generate.</p>
        )}
        {generating && generateStream && <pre {...stylex.props(s.stream)}>{generateStream}</pre>}
        {generateError && <p {...stylex.props(s.error)}>Generate failed: {generateError}</p>}
      </div>
    </Panel>
  )
}
