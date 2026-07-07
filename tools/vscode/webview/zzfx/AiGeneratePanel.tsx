import * as stylex from '@stylexjs/stylex'
import { Button, Panel } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { fromArgs } from './params'
import { playParams } from './audio'
import { DEFAULT_CANDIDATE_COUNT } from './useZzfxSession'
import type { ZzfxCandidate, ZzfxGenerateResultEvent } from './protocol'

// Ship kill-switch for the whole AI Generate feature. Both halves are
// implemented (#148 Z5) — the host wiring that actually registers
// `bridge.on('zzfx/generate', ...)` is Z3's job. Flip to `false` to hide
// this panel entirely without reverting either side.
export const AI_GENERATE_ENABLED = true

const s = stylex.create({
  // This panel always occupies the sidebar's flexible last row (see
  // App.tsx's sidebarStack grid) — same "stretch to fill, scroll
  // internally" slot Atlas's Frames panel fills, so it keeps Panel's
  // 'auto' bodyOverflow default rather than the sibling Category/Style
  // panels' 'visible' override.
  panelFill: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
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
  // Stable-footprint wrapper for the idle hint / streaming readout /
  // error / candidate cards — always mounted (never conditionally
  // removed), so swapping its content never collapses or pops the
  // sidebar's height out from under the params column next to it. The
  // panel itself (not this wrapper) owns the scroll once cards outgrow
  // it — see AiGeneratePanel's `bodyOverflow` (left at the 'auto'
  // default now that this panel is the sidebar's stretched, scrolling
  // row, same slot Atlas's Frames panel fills).
  results: {
    minHeight: 96,
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    backgroundColor: vscode.panelBg,
  },
  cardLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: vscode.fg,
  },
  cardRationale: {
    fontSize: '11px',
    color: vscode.descriptionFg,
    margin: 0,
  },
  cardActions: {
    display: 'flex',
    gap: space.sm,
  },
})

function sourceLabel(source: ZzfxGenerateResultEvent['source']): string {
  if (source === 'lm') return 'Generated via AI'
  if (source === 'cache') return 'Cached AI result'
  return 'Curated preset (AI unavailable)'
}

export type PresetEntryLike = { label: string; params: number[] }

export type AiGeneratePanelProps = {
  standalone: boolean
  lmAvailable: boolean
  category: string | null
  presets: Record<string, PresetEntryLike[]>
  generating: boolean
  generateError: string | null
  generateStream: string
  candidates: ZzfxCandidate[]
  lastGenerateSource: ZzfxGenerateResultEvent['source'] | null
  onGenerate: () => void
  onApplyCandidate: (candidate: PresetEntryLike) => void
}

export function AiGeneratePanel({
  standalone,
  lmAvailable,
  category,
  presets,
  generating,
  generateError,
  generateStream,
  candidates,
  lastGenerateSource,
  onGenerate,
  onApplyCandidate,
}: AiGeneratePanelProps) {
  if (!AI_GENERATE_ENABLED) return null

  // No vscode.lm in this editor host at all (or no signed-in model) —
  // browse the curated preset library directly, no Generate button, no
  // request round trip. planning/vscode-tools/tool-zzfx-studio.md's "AI
  // generation" section: "hide Generate panel and surface a curated
  // preset library."
  if (!lmAvailable) {
    const entries = category ? (presets[category] ?? []) : []
    return (
      <Panel title="Sound Presets (AI unavailable)" style={s.panelFill}>
        <div {...stylex.props(s.body)}>
          <p {...stylex.props(s.description)}>
            No AI model is available in this editor — browsing the curated preset library instead.
          </p>
          {!category && (
            <p {...stylex.props(s.description)}>Pick a category above to see its presets.</p>
          )}
          <div {...stylex.props(s.results)}>
            {entries.length > 0 && (
              <div {...stylex.props(s.cards)}>
                {entries.map((entry, i) => (
                  <CandidateCard
                    key={`${entry.label}-${i}`}
                    label={entry.label}
                    rationale=""
                    onPlay={() => void playParams(fromArgs(entry.params))}
                    onUse={() => onApplyCandidate(entry)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="AI Generate" style={s.panelFill}>
      <div {...stylex.props(s.body)}>
        <p {...stylex.props(s.description)}>
          Generates {DEFAULT_CANDIDATE_COUNT} candidate variations from the category + style pills
          above.
        </p>
        <div {...stylex.props(s.row)}>
          <Button onClick={onGenerate} disabled={standalone || generating || !category}>
            {generating ? 'Generating…' : '✨ Generate'}
          </Button>
          {!category && <span {...stylex.props(s.description)}>Pick a category above first.</span>}
        </div>
        {standalone && (
          <p {...stylex.props(s.description)}>Connect to a host to use AI Generate.</p>
        )}
        {/* Always-mounted footprint — see `s.results`'s doc comment. Its
            content swaps (empty → stream → error → cards) but the
            wrapper itself never mounts/unmounts, so finishing a
            generation can't pop the sidebar's height and shove the
            params column next to it. */}
        <div {...stylex.props(s.results)}>
          {generating && generateStream && <pre {...stylex.props(s.stream)}>{generateStream}</pre>}
          {generateError && <p {...stylex.props(s.error)}>Generate failed: {generateError}</p>}
          {!generating && candidates.length > 0 && (
            <>
              {lastGenerateSource && (
                <span {...stylex.props(s.badge)}>{sourceLabel(lastGenerateSource)}</span>
              )}
              <div {...stylex.props(s.cards)}>
                {candidates.map((c, i) => (
                  <CandidateCard
                    key={`${c.label}-${i}`}
                    label={c.label}
                    rationale={c.rationale}
                    onPlay={() => void playParams(fromArgs(c.params))}
                    onUse={() => onApplyCandidate(c)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

function CandidateCard({
  label,
  rationale,
  onPlay,
  onUse,
}: {
  label: string
  rationale: string
  onPlay: () => void
  onUse: () => void
}) {
  return (
    <div {...stylex.props(s.card)}>
      <span {...stylex.props(s.cardLabel)}>{label}</span>
      {rationale && <p {...stylex.props(s.cardRationale)}>{rationale}</p>}
      <div {...stylex.props(s.cardActions)}>
        <Button onClick={onPlay}>▶ Play</Button>
        <Button onClick={onUse}>Use this</Button>
      </div>
    </div>
  )
}
