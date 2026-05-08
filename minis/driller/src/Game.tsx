import type { DrillerProps } from './types'

/**
 * Driller mini-game root component.
 *
 * Phase 1 stub — boots without errors. Full composition arrives in Task 43
 * (mode-aware shell wiring all subsystems).
 */
export default function Driller(props: DrillerProps) {
  const { className, mode = 'hero' } = props
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0a0a14',
        color: '#fcd34d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        letterSpacing: '0.1em',
      }}
    >
      driller — boot OK ({mode})
    </div>
  )
}
