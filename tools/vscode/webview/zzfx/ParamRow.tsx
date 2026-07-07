import * as stylex from '@stylexjs/stylex'
import { CompactSelect, NumberField, Slider } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { PARAM_SPECS, SHAPE_OPTIONS, type ParamKey } from './params'

const s = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    paddingBlock: space.xs,
  },
  label: {
    width: 100,
    flexShrink: 0,
    fontSize: '11px',
    color: vscode.descriptionFg,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  numField: {
    width: 64,
    flexShrink: 0,
  },
})

export type ParamRowProps = {
  paramKey: ParamKey
  value: number
  onChange: (key: ParamKey, next: number) => void
}

/** One param: label + control(s). `shape` renders a dropdown (its 5
 * values are named waveforms, not a continuous range); every other param
 * renders a scrub slider paired with an exact-value NumberField. */
export function ParamRow({ paramKey, value, onChange }: ParamRowProps) {
  const spec = PARAM_SPECS[paramKey]

  if (paramKey === 'shape') {
    return (
      <div {...stylex.props(s.row)}>
        <span {...stylex.props(s.label)}>{spec.label}</span>
        <CompactSelect
          value={String(value)}
          options={SHAPE_OPTIONS}
          onChange={(v) => onChange(paramKey, Number(v))}
          aria-label={spec.label}
        />
      </div>
    )
  }

  return (
    <div {...stylex.props(s.row)}>
      <span {...stylex.props(s.label)}>{spec.label}</span>
      <Slider
        value={value}
        range={{ min: spec.min, max: spec.max, step: spec.step }}
        onChange={(v) => onChange(paramKey, v)}
        aria-label={spec.label}
      />
      <div {...stylex.props(s.numField)}>
        <NumberField
          value={value}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          onChange={(v) => onChange(paramKey, v)}
          aria-label={`${spec.label} value`}
        />
      </div>
    </div>
  )
}
