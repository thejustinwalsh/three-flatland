import * as stylex from '@stylexjs/stylex'
import { CompactSelect, NumberField, Panel } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import {
  DEFAULT_BUMP,
  DEFAULT_ELEVATION,
  DEFAULT_PITCH,
  DEFAULT_STRENGTH,
  type NormalBump,
} from '@three-flatland/normals'
import { DirectionCompass } from './DirectionCompass'
import type { NormalBakerDefaults } from './normalBakerStore'
import { Slider } from './Slider'

// Descriptor-level defaults every region inherits from when it omits a
// field. `strength` and `bump` are genuinely descriptor fields (not a
// separate "bake options" bag) — `resolveRegion()` in
// packages/normals/src/descriptor.ts reads `region.strength ?? descriptor.strength
// ?? DEFAULT_STRENGTH` and the same for `bump`, and the CLI's --strength/--bump
// flags write directly onto the descriptor object. So both live here, in
// `descriptor`, not in the save payload's `options` bag — see
// tools/vscode/webview/normal-baker/README.md's bridge contract note.

const BUMP_OPTIONS: Array<{ value: NormalBump; label: string }> = [
  { value: 'alpha', label: 'alpha' },
  { value: 'luminance', label: 'luminance' },
  { value: 'red', label: 'red' },
  { value: 'green', label: 'green' },
  { value: 'blue', label: 'blue' },
  { value: 'none', label: 'none' },
]

const s = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
    padding: space.lg,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  label: {
    color: vscode.descriptionFg,
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
  },
  compassRow: {
    display: 'flex',
    justifyContent: 'center',
  },
})

const RAD_TO_DEG = 180 / Math.PI

function formatDegrees(radians: number): string {
  return `${(radians * RAD_TO_DEG).toFixed(0)}°`
}

function formatUnit(v: number): string {
  return v.toFixed(2)
}

export type DefaultsPanelProps = {
  defaults: NormalBakerDefaults
  onChange: (patch: Partial<NormalBakerDefaults>) => void
}

export function DefaultsPanel({ defaults, onChange }: DefaultsPanelProps) {
  const direction = defaults.direction ?? 'flat'
  const pitch = defaults.pitch ?? DEFAULT_PITCH
  const elevation = defaults.elevation ?? DEFAULT_ELEVATION
  const strength = defaults.strength ?? DEFAULT_STRENGTH
  const bump = defaults.bump ?? DEFAULT_BUMP

  return (
    <Panel title="Defaults" bodyOverflow="visible">
      <div {...stylex.props(s.body)}>
        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>Direction</span>
          <div {...stylex.props(s.compassRow)}>
            <DirectionCompass
              value={direction}
              onChange={(next) => onChange({ direction: next })}
            />
          </div>
        </div>

        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>Pitch</span>
          <Slider
            value={pitch}
            min={0}
            max={Math.PI / 2}
            step={0.01}
            format={formatDegrees}
            onChange={(v) => onChange({ pitch: v })}
            aria-label="Default pitch"
          />
        </div>

        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>Elevation</span>
          <Slider
            value={elevation}
            min={0}
            max={1}
            step={0.01}
            format={formatUnit}
            onChange={(v) => onChange({ elevation: v })}
            aria-label="Default elevation"
          />
        </div>

        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>Strength</span>
          <NumberField
            value={strength}
            step={0.1}
            onChange={(v) => onChange({ strength: v })}
            aria-label="Default strength"
          />
        </div>

        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>Bump source</span>
          <CompactSelect
            value={bump}
            options={BUMP_OPTIONS}
            onChange={(next) => onChange({ bump: next })}
            aria-label="Default bump source"
          />
        </div>
      </div>
    </Panel>
  )
}
