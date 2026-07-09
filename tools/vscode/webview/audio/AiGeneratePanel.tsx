import { useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Button, Panel, ToolbarButton } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { fromArgs } from './params'
import { playParams } from './audio'
import { DEFAULT_CANDIDATE_COUNT } from './useZzfxSession'
import type { ZzfxCandidate, ZzfxGenerateResultEvent, ZzfxHistoryBatch } from './protocol'

// Ship kill-switch for the whole AI Generate feature. Both halves are
// implemented (#148 Z5) — the host wiring that actually registers
// `bridge.on('zzfx/generate', ...)` is Z3's job. Flip to `false` to hide
// this panel entirely without reverting either side.
export const AI_GENERATE_ENABLED = true

// How long the header Clear-all button holds its armed "click again"
// state before quietly disarming — long enough to move the pointer up
// and confirm, short enough that a stray first click can't lie in wait.
const CLEAR_CONFIRM_WINDOW_MS = 3000

const s = stylex.create({
  // This panel always occupies the sidebar's flexible last row (see
  // App.tsx's sidebar flex column) — same "stretch to fill, scroll
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
  // error / transient preset cards / history — always mounted (never
  // conditionally removed), so swapping its content never collapses or
  // pops the sidebar's height out from under the params column next to
  // it. The panel itself (not this wrapper) owns the scroll once content
  // outgrows it.
  results: {
    minHeight: 96,
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
  },
  cards: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  },
  // One persisted generate batch: quiet header (relative time + what it
  // was generated with) above its cards — history reads as a log, newest
  // first, not a fresh result each time.
  batch: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  batchHeader: {
    fontSize: '10px',
    color: vscode.descriptionFg,
    fontFamily: vscode.monoFontFamily,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
  cardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  cardLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: vscode.fg,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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

/** Quiet log-style timestamp for a batch header — precision decays with
 * age on purpose; "which generate was this" needs vibes, not seconds. */
function relativeTime(ts: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

function batchSummary(batch: ZzfxHistoryBatch, now: number): string {
  const styles = batch.styles.length > 0 ? ` · ${batch.styles.join(', ')}` : ''
  const cached = batch.source === 'cache' ? ' · cached' : ''
  return `${relativeTime(batch.ts, now)} · ${batch.category}${styles}${cached}`
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
  history: ZzfxHistoryBatch[]
  historyError: string | null
  onGenerate: () => void
  onApplyCandidate: (candidate: PresetEntryLike) => void
  onDeleteCandidate: (batchTs: number, index: number) => void
  onClearHistory: () => void
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
  history,
  historyError,
  onGenerate,
  onApplyCandidate,
  onDeleteCandidate,
  onClearHistory,
}: AiGeneratePanelProps) {
  const streamRef = useRef<HTMLPreElement>(null)

  // Follow the tail as tokens stream in — otherwise the readout stays
  // pinned to the top and the most recent (most useful) text scrolls
  // out of view under its own `maxHeight`/`overflow: auto`.
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [generateStream])

  if (!AI_GENERATE_ENABLED) return null

  const historySection = (
    <>
      {historyError && <p {...stylex.props(s.error)}>History update failed: {historyError}</p>}
      {history.map((batch) => (
        <HistoryBatchGroup
          key={batch.ts}
          batch={batch}
          onApplyCandidate={onApplyCandidate}
          onDeleteCandidate={onDeleteCandidate}
        />
      ))}
    </>
  )
  const clearAllAction = history.length > 0 && (
    <ClearHistoryButton onClearHistory={onClearHistory} />
  )

  // No vscode.lm in this editor host at all (or no signed-in model) —
  // browse the curated preset library directly, no Generate button, no
  // request round trip. planning/vscode-tools/tool-zzfx-studio.md's "AI
  // generation" section: "hide Generate panel and surface a curated
  // preset library." Persisted history (from a session where a model WAS
  // available) still renders — losing paid-for sounds to a sign-out
  // would be exactly the disappearance this feature exists to stop.
  if (!lmAvailable) {
    const entries = category ? (presets[category] ?? []) : []
    return (
      <Panel
        title="Sound Presets (AI unavailable)"
        style={s.panelFill}
        headerActions={clearAllAction}
      >
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
            {historySection}
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="AI Generate" style={s.panelFill} headerActions={clearAllAction}>
      <div {...stylex.props(s.body)}>
        <p {...stylex.props(s.description)}>
          Generates {DEFAULT_CANDIDATE_COUNT} candidate variations from the category + style pills
          above.
        </p>
        <div {...stylex.props(s.row)}>
          <Button
            icon="sparkle"
            onClick={onGenerate}
            disabled={standalone || generating || !category}
          >
            {generating ? 'Generating…' : 'Generate'}
          </Button>
          {!category && <span {...stylex.props(s.description)}>Pick a category above first.</span>}
        </div>
        {standalone && (
          <p {...stylex.props(s.description)}>Connect to a host to use AI Generate.</p>
        )}
        {/* Always-mounted footprint — see `s.results`'s doc comment. Its
            content swaps (empty → stream → error → history) but the
            wrapper itself never mounts/unmounts, so finishing a
            generation can't pop the sidebar's height and shove the
            params column next to it. */}
        <div {...stylex.props(s.results)}>
          {generating && generateStream && (
            <pre ref={streamRef} {...stylex.props(s.stream)}>
              {generateStream}
            </pre>
          )}
          {generateError && <p {...stylex.props(s.error)}>Generate failed: {generateError}</p>}
          {/* lm/cache results arrive as the newest history batch (the
              host persists them at the same moment it emits the result),
              so only the never-persisted preset fallback still renders as
              a transient result — labeled, with no delete affordance
              (there's nothing stored to delete). */}
          {!generating && candidates.length > 0 && lastGenerateSource === 'preset' && (
            <div {...stylex.props(s.batch)}>
              <span {...stylex.props(s.badge)}>{sourceLabel('preset')} — not kept in history</span>
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
            </div>
          )}
          {historySection}
        </div>
      </div>
    </Panel>
  )
}

/** Header Clear-all with an inline two-step confirm (chosen over a native
 * showWarningMessage round trip: it stays in the suite's quiet idiom and
 * never yanks focus to a modal for a low-stakes, single-source clear).
 * First click arms it — icon and title flip to the explicit "click again"
 * state — and it quietly disarms after {@link CLEAR_CONFIRM_WINDOW_MS}. */
function ClearHistoryButton({ onClearHistory }: { onClearHistory: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), CLEAR_CONFIRM_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <ToolbarButton
      icon={armed ? 'warning' : 'clear-all'}
      title={
        armed ? 'Click again to clear all history for this sound' : 'Clear history for this sound'
      }
      onClick={() => {
        if (armed) {
          setArmed(false)
          onClearHistory()
        } else {
          setArmed(true)
        }
      }}
    />
  )
}

function HistoryBatchGroup({
  batch,
  onApplyCandidate,
  onDeleteCandidate,
}: {
  batch: ZzfxHistoryBatch
  onApplyCandidate: (candidate: PresetEntryLike) => void
  onDeleteCandidate: (batchTs: number, index: number) => void
}) {
  return (
    <div {...stylex.props(s.batch)}>
      <span {...stylex.props(s.batchHeader)} title={new Date(batch.ts).toLocaleString()}>
        {batchSummary(batch, Date.now())}
      </span>
      <div {...stylex.props(s.cards)}>
        {batch.candidates.map((c, i) => (
          <CandidateCard
            key={`${batch.ts}-${i}`}
            label={c.label}
            rationale={c.rationale}
            onPlay={() => void playParams(fromArgs(c.params))}
            onUse={() => onApplyCandidate(c)}
            onDelete={() => onDeleteCandidate(batch.ts, i)}
          />
        ))}
      </div>
    </div>
  )
}

function CandidateCard({
  label,
  rationale,
  onPlay,
  onUse,
  onDelete,
}: {
  label: string
  rationale: string
  onPlay: () => void
  onUse: () => void
  /** Present only for persisted history candidates — transient preset
   * results have nothing stored to delete. */
  onDelete?: () => void
}) {
  return (
    <div {...stylex.props(s.card)}>
      <div {...stylex.props(s.cardTitleRow)}>
        <span {...stylex.props(s.cardLabel)}>{label}</span>
        {onDelete && <ToolbarButton icon="trash" title={`Delete "${label}"`} onClick={onDelete} />}
      </div>
      {rationale && <p {...stylex.props(s.cardRationale)}>{rationale}</p>}
      <div {...stylex.props(s.cardActions)}>
        <Button secondary icon="play" onClick={onPlay}>
          Play
        </Button>
        <Button onClick={onUse}>Use this</Button>
      </div>
    </div>
  )
}
