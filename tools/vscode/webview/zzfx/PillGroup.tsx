import * as stylex from '@stylexjs/stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { Pill } from './Pill'

const s = stylex.create({
  wrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.sm,
  },
})

export type PillGroupProps<T extends string> = {
  options: readonly T[]
  selected: readonly T[]
  onChange: (next: T[]) => void
  /** Single-select (default) toggles the clicked pill on, replacing any
   * prior selection, and clicking the active pill deselects it. Multi
   * toggles independently, capped at `max`. */
  multiple?: boolean
  /** Only meaningful with `multiple` — extra pills disable once reached. */
  max?: number
  'aria-label'?: string
}

export function PillGroup<T extends string>({
  options,
  selected,
  onChange,
  multiple = false,
  max,
  ...rest
}: PillGroupProps<T>) {
  const ariaLabel = rest['aria-label']

  const toggle = (opt: T) => {
    if (!multiple) {
      onChange(selected[0] === opt ? [] : [opt])
      return
    }
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt))
      return
    }
    if (max !== undefined && selected.length >= max) return
    onChange([...selected, opt])
  }

  return (
    <div role="group" aria-label={ariaLabel} {...stylex.props(s.wrap)}>
      {options.map((opt) => {
        const active = selected.includes(opt)
        const atMax = multiple && max !== undefined && selected.length >= max
        return (
          <Pill
            key={opt}
            label={opt}
            active={active}
            disabled={atMax && !active}
            onToggle={() => toggle(opt)}
          />
        )
      })}
    </div>
  )
}
