import * as stylex from '@stylexjs/stylex'
import { CompactSelect, NumberField, ToolbarButton } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import {
  DEFAULT_BUMP,
  DEFAULT_ELEVATION,
  DEFAULT_PITCH,
  DEFAULT_STRENGTH,
  type NormalBump,
  type NormalRegion,
} from '@three-flatland/normals'
import { DirectionCompass } from './DirectionCompass'
import {
  clearRegionField,
  isFieldOverridden,
  resolveBump,
  resolveDirection,
  resolveElevation,
  resolvePitch,
  resolveStrength,
  type OverridableField,
} from './fieldResolution'
import type { NormalBakerDefaults } from './normalBakerStore'
import type { EditableRegion } from './regionOps'
import { Slider } from './Slider'

// One selection-aware inspector replacing the old always-both
// Properties + Defaults panel pair: exactly one region selected → edit
// THAT region (geometry + shading with per-field override/reset);
// nothing selected → edit the descriptor-level defaults every region
// inherits from. Multi-selection edits neither — bulk-editing regions
// and editing defaults look identical here, and silently doing either
// would be the wrong surprise for the other intent.

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
  geomGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: space.md,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
  },
  fieldHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    // Reserve the reset button's height even when it's not rendered
    // (field not overridden) so the label row doesn't shift height as
    // the user toggles a field between inherited and explicit.
    minHeight: 18,
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
  hint: {
    padding: space.lg,
    color: vscode.descriptionFg,
    fontSize: '12px',
  },
})

const RAD_TO_DEG = 180 / Math.PI

function formatDegrees(radians: number): string {
  return `${(radians * RAD_TO_DEG).toFixed(0)}°`
}

function formatUnit(v: number): string {
  return v.toFixed(2)
}

type FieldHeaderProps = {
  label: string
  field: OverridableField
  region: NormalRegion
  onReset: (field: OverridableField) => void
}

/**
 * Label + a "reset to inherited" button that only renders when this
 * field is explicitly set on the region. Resetting is the one
 * legitimate way an explicit field goes back to omitted/inherited —
 * see `fieldResolution.ts`'s module doc for why nothing does this
 * automatically anymore.
 */
function FieldHeader({ label, field, region, onReset }: FieldHeaderProps) {
  const overridden = isFieldOverridden(region, field)
  return (
    <div {...stylex.props(s.fieldHeader)}>
      <span {...stylex.props(s.label)}>{label}</span>
      {overridden ? (
        <ToolbarButton
          icon="close"
          title={`Reset ${label.toLowerCase()} to inherited`}
          onClick={() => onReset(field)}
        />
      ) : null}
    </div>
  )
}

type RegionInspectorProps = {
  region: EditableRegion
  defaults: NormalBakerDefaults
  onChange: (next: EditableRegion) => void
}

/**
 * Numeric geometry + direction/pitch/strength/bump/elevation editor for
 * the single selected region. Every field the user touches here is
 * written back explicitly — even when the new value happens to equal
 * the descriptor's current default. This is deliberate: an explicit
 * value the user picked must survive a LATER edit to the descriptor
 * default unchanged (it was pinned, not inherited-by-coincidence).
 * Silently stripping a field just because it currently matches the
 * default would make that field's meaning retroactively depend on
 * default edits the user never asked it to track — see
 * `fieldResolution.ts`'s module doc for the fuller writeup of why an
 * earlier normalize-on-write design here was wrong. Only fields the
 * user never touches (freshly drawn regions' bump/direction/pitch/
 * strength/elevation) stay omitted/inherited — and the only way BACK to
 * omitted after an explicit edit is the per-field reset button below,
 * a deliberate action, not a side effect of some other edit.
 */
function RegionInspector({ region, defaults, onChange }: RegionInspectorProps) {
  const commit = (patch: Partial<NormalRegion>) => {
    onChange({ ...region, ...patch })
  }

  const reset = (field: OverridableField) => {
    onChange({ ...clearRegionField(region, field), id: region.id })
  }

  const direction = resolveDirection(region, defaults)
  const bump = resolveBump(region, defaults)
  const pitch = resolvePitch(region, defaults)
  const elevation = resolveElevation(region, defaults)
  const strength = resolveStrength(region, defaults)

  return (
    <div {...stylex.props(s.body)}>
      <div {...stylex.props(s.geomGrid)}>
        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>X</span>
          <NumberField value={region.x} min={0} onChange={(v) => commit({ x: Math.round(v) })} />
        </div>
        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>Y</span>
          <NumberField value={region.y} min={0} onChange={(v) => commit({ y: Math.round(v) })} />
        </div>
        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>W</span>
          <NumberField value={region.w} min={1} onChange={(v) => commit({ w: Math.round(v) })} />
        </div>
        <div {...stylex.props(s.field)}>
          <span {...stylex.props(s.label)}>H</span>
          <NumberField value={region.h} min={1} onChange={(v) => commit({ h: Math.round(v) })} />
        </div>
      </div>

      <div {...stylex.props(s.field)}>
        <FieldHeader label="Direction" field="direction" region={region} onReset={reset} />
        <div {...stylex.props(s.compassRow)}>
          <DirectionCompass value={direction} onChange={(next) => commit({ direction: next })} />
        </div>
      </div>

      <div {...stylex.props(s.field)}>
        <FieldHeader label="Pitch" field="pitch" region={region} onReset={reset} />
        <Slider
          value={pitch}
          min={0}
          max={Math.PI / 2}
          step={0.01}
          format={formatDegrees}
          onChange={(v) => commit({ pitch: v })}
          aria-label="Pitch"
        />
      </div>

      <div {...stylex.props(s.field)}>
        <FieldHeader label="Elevation" field="elevation" region={region} onReset={reset} />
        <Slider
          value={elevation}
          min={0}
          max={1}
          step={0.01}
          format={formatUnit}
          onChange={(v) => commit({ elevation: v })}
          aria-label="Elevation"
        />
      </div>

      <div {...stylex.props(s.field)}>
        <FieldHeader label="Strength" field="strength" region={region} onReset={reset} />
        <NumberField
          value={strength}
          step={0.1}
          onChange={(v) => commit({ strength: v })}
          aria-label="Strength"
        />
      </div>

      <div {...stylex.props(s.field)}>
        <FieldHeader label="Bump source" field="bump" region={region} onReset={reset} />
        <CompactSelect
          value={bump}
          options={BUMP_OPTIONS}
          onChange={(next) => commit({ bump: next })}
          aria-label="Bump source"
        />
      </div>
    </div>
  )
}

type DefaultsInspectorProps = {
  defaults: NormalBakerDefaults
  onChange: (patch: Partial<NormalBakerDefaults>) => void
}

// Descriptor-level defaults every region inherits from when it omits a
// field. `strength` and `bump` are genuinely descriptor fields (not a
// separate "bake options" bag) — `resolveRegion()` in
// packages/normals/src/descriptor.ts reads `region.strength ?? descriptor.strength
// ?? DEFAULT_STRENGTH` and the same for `bump`, and the CLI's --strength/--bump
// flags write directly onto the descriptor object. So both live here, in
// `descriptor`, not in the save payload's `options` bag — see
// tools/vscode/webview/normal-baker/README.md's bridge contract note.
function DefaultsInspector({ defaults, onChange }: DefaultsInspectorProps) {
  const direction = defaults.direction ?? 'flat'
  const pitch = defaults.pitch ?? DEFAULT_PITCH
  const elevation = defaults.elevation ?? DEFAULT_ELEVATION
  const strength = defaults.strength ?? DEFAULT_STRENGTH
  const bump = defaults.bump ?? DEFAULT_BUMP

  return (
    <div {...stylex.props(s.body)}>
      <div {...stylex.props(s.field)}>
        <span {...stylex.props(s.label)}>Direction</span>
        <div {...stylex.props(s.compassRow)}>
          <DirectionCompass value={direction} onChange={(next) => onChange({ direction: next })} />
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
  )
}

export type InspectorProps = {
  /** The single selected region, or null (none, or more than one). */
  region: EditableRegion | null
  selectionCount: number
  defaults: NormalBakerDefaults
  onRegionChange: (next: EditableRegion) => void
  onDefaultsChange: (patch: Partial<NormalBakerDefaults>) => void
}

/** Heading for the Info collapsible hosting the inspector — mirrors which editor is showing. */
export function inspectorHeading(region: EditableRegion | null, selectionCount: number): string {
  if (region) return 'Region'
  if (selectionCount > 1) return `Region (${selectionCount} selected)`
  return 'Defaults'
}

export function Inspector({
  region,
  selectionCount,
  defaults,
  onRegionChange,
  onDefaultsChange,
}: InspectorProps) {
  if (region) {
    return <RegionInspector region={region} defaults={defaults} onChange={onRegionChange} />
  }
  if (selectionCount > 1) {
    return (
      <div {...stylex.props(s.hint)}>
        {selectionCount} regions selected — select exactly one to edit it, or clear the selection to
        edit the inherited defaults.
      </div>
    )
  }
  return <DefaultsInspector defaults={defaults} onChange={onDefaultsChange} />
}
