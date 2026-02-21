type DevToolsColor =
  | 'primary'
  | 'primary-light'
  | 'primary-dark'
  | 'secondary'
  | 'secondary-light'
  | 'secondary-dark'
  | 'tertiary'
  | 'tertiary-light'
  | 'tertiary-dark'
  | 'error'

interface MeasureOptions {
  track?: string
  trackGroup?: string
  color?: DevToolsColor
  properties?: [string, string][]
}

type MeasureEnd = () => void
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type MeasureStart = (fn: Function, options?: MeasureOptions) => MeasureEnd

const noop = () => {}

const DEFAULTS: Required<Pick<MeasureOptions, 'track' | 'trackGroup' | 'color'>> = {
  track: 'Systems',
  trackGroup: 'three-flatland',
  color: 'tertiary-dark',
}

/**
 * Measure the execution time of a block and report it to Chrome DevTools
 * Performance panel as a custom track entry.
 *
 * The name is derived from `fn.name` so entries map directly back to the
 * source function (searchable in code).
 *
 * In production builds, this is a no-op to avoid performance overhead.
 *
 * @example
 * ```ts
 * const end = measure(transformSyncSystem)
 * transformSyncSystem(world)
 * end()
 * ```
 *
 * @internal
 */
export const measure: MeasureStart =
  process.env.NODE_ENV === 'production'
    ? () => noop
    : (fn, options) => {
        if (typeof performance === 'undefined') {
          return noop
        }

        const start = performance.now()
        return () => {
          const end = performance.now()
          const duration = end - start
          const name = fn.name || 'anonymous'
          const track = options?.track ?? DEFAULTS.track
          const trackGroup = options?.trackGroup ?? DEFAULTS.trackGroup
          const color = options?.color ?? DEFAULTS.color

          const properties: [string, string][] = [
            ['System', name],
            ['Duration', `${duration.toFixed(3)}ms`],
            ...(options?.properties ?? []),
          ]

          performance.measure(name, {
            start,
            end,
            detail: {
              devtools: {
                dataType: 'track-entry',
                track,
                trackGroup,
                color,
                properties,
                tooltipText: name,
              },
            },
          })
        }
      }
