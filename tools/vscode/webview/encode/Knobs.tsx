import * as stylex from '@stylexjs/stylex'
import { CompactSelect, NumberField, Checkbox } from '@three-flatland/design-system'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { useEncodeStore, type EncodeStoreState } from './encodeStore'

type Format = EncodeStoreState['format']

const styles = stylex.create({
  row: {
    display: 'flex',
    gap: space.md,
    padding: space.sm,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  label: { fontSize: 12, opacity: 0.85 },
  group: { display: 'flex', gap: space.sm, alignItems: 'center' },
})

const FORMAT_OPTIONS = [
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'ktx2', label: 'KTX2' },
] as const

const KTX2_MODE_OPTIONS = [
  { value: 'etc1s', label: 'ETC1S' },
  { value: 'uastc', label: 'UASTC' },
] as const

export function Knobs() {
  const format = useEncodeStore((s) => s.format)
  const webp = useEncodeStore((s) => s.webp)
  const avif = useEncodeStore((s) => s.avif)
  const ktx2 = useEncodeStore((s) => s.ktx2)
  const mode = useEncodeStore((s) => s.mode)

  const setFormat = useEncodeStore((s) => s.setFormat)
  const setWebpQuality = useEncodeStore((s) => s.setWebpQuality)
  const setAvifQuality = useEncodeStore((s) => s.setAvifQuality)
  const setKtx2Mode = useEncodeStore((s) => s.setKtx2Mode)
  const setKtx2Mipmaps = useEncodeStore((s) => s.setKtx2Mipmaps)
  const setKtx2UastcLevel = useEncodeStore((s) => s.setKtx2UastcLevel)

  const disabled = mode === 'inspect'

  return (
    <div
      {...stylex.props(styles.row)}
      style={disabled ? { pointerEvents: 'none', opacity: 0.4 } : undefined}
    >
      <div {...stylex.props(styles.group)}>
        <span {...stylex.props(styles.label)}>Format</span>
        <CompactSelect
          value={format}
          options={FORMAT_OPTIONS}
          onChange={(v) => setFormat(v as Format)}
          aria-label="Output format"
        />
      </div>

      {format === 'webp' && (
        <div {...stylex.props(styles.group)}>
          <span {...stylex.props(styles.label)}>Quality</span>
          <NumberField
            value={webp.quality}
            min={0}
            max={100}
            step={1}
            onChange={setWebpQuality}
            aria-label="WebP quality"
          />
        </div>
      )}

      {format === 'avif' && (
        <div {...stylex.props(styles.group)}>
          <span {...stylex.props(styles.label)}>Quality</span>
          <NumberField
            value={avif.quality}
            min={0}
            max={100}
            step={1}
            onChange={setAvifQuality}
            aria-label="AVIF quality"
          />
        </div>
      )}

      {format === 'ktx2' && (
        <>
          <div {...stylex.props(styles.group)}>
            <span {...stylex.props(styles.label)}>Mode</span>
            <CompactSelect
              value={ktx2.mode}
              options={KTX2_MODE_OPTIONS}
              onChange={(v) => setKtx2Mode(v as 'etc1s' | 'uastc')}
              aria-label="KTX2 mode"
            />
          </div>
          {ktx2.mode === 'uastc' && (
            <div {...stylex.props(styles.group)}>
              <span {...stylex.props(styles.label)}>Level</span>
              <NumberField
                value={ktx2.uastcLevel}
                min={0}
                max={4}
                step={1}
                onChange={(v) => setKtx2UastcLevel(v as 0 | 1 | 2 | 3 | 4)}
                aria-label="UASTC level"
              />
            </div>
          )}
          <div {...stylex.props(styles.group)}>
            <Checkbox
              label="Mipmaps"
              checked={ktx2.mipmaps}
              onChange={(e) => {
                const el = e.currentTarget as HTMLElement & { checked: boolean }
                setKtx2Mipmaps(el.checked)
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
