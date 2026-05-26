// tools/vscode/webview/encode/InfoPanel.tsx
import * as stylex from '@stylexjs/stylex'
import { Scrollable } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { useEncodeStore } from './encodeStore'
import { getKtx2Caps } from './gpuCaps'
import { InfoBar } from './InfoPanel.bar'
import { InfoSection } from './InfoSection'

const s = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    fontFamily: vscode.fontFamily,
    fontSize: '12px',
    color: vscode.fg,
  },
  // Padding inside each Collapsible body. The Collapsible owns the
  // header bar + outer chrome; this wrapper just adds breathing room
  // to the rows inside.
  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    padding: space.lg,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.md,
  },
  rowLabel: {
    color: vscode.descriptionFg,
    flexShrink: 0,
  },
  rowValue: {
    fontFamily: vscode.monoFontFamily,
    textAlign: 'end',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowValueOver: {
    color: vscode.errorFg,
  },
  mipsTable: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    columnGap: space.md,
    rowGap: space.xs,
    fontFamily: vscode.monoFontFamily,
  },
  mipsCell: {
    color: vscode.fg,
  },
  mipsCellMuted: {
    color: vscode.descriptionFg,
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: space.xs,
    marginTop: space.xs,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.inputBorder,
    fontFamily: vscode.monoFontFamily,
  },
  barWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.xs,
    paddingTop: space.xs,
  },
  barCaption: {
    fontSize: '11px',
    color: vscode.descriptionFg,
    fontFamily: vscode.monoFontFamily,
  },
  capCheck: {
    color: vscode.fg,
    fontFamily: vscode.monoFontFamily,
  },
  capCross: {
    color: vscode.descriptionFg,
    fontFamily: vscode.monoFontFamily,
  },
  cpuNote: {
    fontSize: '11px',
    color: vscode.descriptionFg,
    paddingTop: space.xs,
    fontStyle: 'italic',
  },
})

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function detectSourceFormat(fileName: string): string {
  const ext = fileName.split('.').pop()?.toUpperCase() ?? ''
  return ext || '?'
}

function describeQuality(
  format: string,
  webp: { quality: number },
  avif: { quality: number },
  ktx2: { mode: string; quality: number; uastcLevel: number },
  // In inspect mode the doc-slice quality fields don't reflect how the
  // file we're inspecting was actually encoded (we have no way to know);
  // showing them would be misleading, so fall back to the format alone.
  inspect = false,
): string {
  if (inspect) return format.toUpperCase()
  if (format === 'webp') return `WebP q=${webp.quality}`
  if (format === 'avif') return `AVIF q=${avif.quality}`
  if (format === 'ktx2' && ktx2.mode === 'etc1s') return `KTX2 ETC1S q=${ktx2.quality}`
  if (format === 'ktx2' && ktx2.mode === 'uastc') return `KTX2 UASTC L${ktx2.uastcLevel}`
  return format.toUpperCase()
}

export function InfoPanel() {
  const fileName = useEncodeStore((s) => s.fileName)
  const sourceImage = useEncodeStore((st) => st.sourceImage)
  const sourceBytes = useEncodeStore((st) => st.sourceBytes)
  const encodedBytes = useEncodeStore((st) => st.encodedBytes)
  const encodedFormat = useEncodeStore((st) => st.encodedFormat)
  const encodedImage = useEncodeStore((st) => st.encodedImage)
  const format = useEncodeStore((st) => st.format)
  const webp = useEncodeStore((st) => st.webp)
  const avif = useEncodeStore((st) => st.avif)
  const ktx2 = useEncodeStore((st) => st.ktx2)
  const gpuStats = useEncodeStore((st) => st.gpuStats)
  const mode = useEncodeStore((st) => st.mode)

  const caps = getKtx2Caps()
  const isInspect = mode === 'inspect'

  const sourceLen = sourceBytes?.length ?? 0
  const encodedLen = encodedBytes?.length ?? 0
  // In inspect mode (especially KTX2) sourceImage is null — fall back to
  // gpuStats's mip-0 dimensions. They agree with sourceImage in encode mode
  // since extractGpuStats writes the same w/h for the non-mip case.
  const sw = sourceImage?.width ?? gpuStats?.mips[0]?.width ?? 0
  const sh = sourceImage?.height ?? gpuStats?.mips[0]?.height ?? 0

  const wireRatio = sourceLen > 0 ? encodedLen / sourceLen : 0
  const wireSavedBytes = Math.max(0, sourceLen - encodedLen)
  const wireRegressed = encodedLen > sourceLen

  // In encode mode `encodedImage` is the decoded WebP/AVIF (null for KTX2).
  // In inspect mode we never set `encodedImage`, but the artifact IS the
  // source — for WebP/AVIF the host pre-decoded into `sourceImage`, so its
  // dims tell us the RGBA size that would be allocated.
  const cpuDecodedRgba = encodedImage
    ? encodedImage.width * encodedImage.height * 4
    : isInspect && sourceImage
      ? sourceImage.width * sourceImage.height * 4
      : null
  const cpuKtx2 = encodedFormat === 'ktx2'

  const totalGpuBytes = gpuStats
    ? gpuStats.mips.reduce((a, m) => a + m.bytes, 0)
    : 0
  const gpuBaseline = sw * sh * 4
  const gpuRatio = gpuBaseline > 0 ? totalGpuBytes / gpuBaseline : 0

  return (
    <Scrollable>
      <div {...stylex.props(s.body)}>
        <InfoSection id="source" heading="Source">
          <div {...stylex.props(s.sectionBody)}>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.rowLabel)}>File</span>
              <span {...stylex.props(s.rowValue)}>{fileName}</span>
            </div>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.rowLabel)}>Dimensions</span>
              <span {...stylex.props(s.rowValue)}>{sw} × {sh}</span>
            </div>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.rowLabel)}>Original</span>
              <span {...stylex.props(s.rowValue)}>
                {formatBytes(sourceLen)} · {detectSourceFormat(fileName)}
              </span>
            </div>
          </div>
        </InfoSection>

        <InfoSection id="wire" heading="Wire">
          <div {...stylex.props(s.sectionBody)}>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.rowLabel)}>Encoded</span>
              <span {...stylex.props(s.rowValue)}>
                {formatBytes(encodedLen)} · {describeQuality(encodedFormat ?? format, webp, avif, ktx2, isInspect)}
              </span>
            </div>
            {!isInspect && (
              <>
                <div {...stylex.props(s.barWrap)}>
                  <InfoBar ratio={wireRatio} />
                  <span
                    {...stylex.props(
                      s.barCaption,
                      wireRegressed && s.rowValueOver,
                    )}
                  >
                    {sourceLen > 0 ? `${(wireRatio * 100).toFixed(0)}% of original` : ''}
                  </span>
                </div>
                <div {...stylex.props(s.row)}>
                  <span {...stylex.props(s.rowLabel)}>
                    {wireRegressed ? 'Grew' : 'Saved'}
                  </span>
                  <span {...stylex.props(s.rowValue, wireRegressed && s.rowValueOver)}>
                    {formatBytes(wireRegressed ? encodedLen - sourceLen : wireSavedBytes)}
                  </span>
                </div>
              </>
            )}
          </div>
        </InfoSection>

        <InfoSection id="cpu" heading="CPU memory after decode">
          <div {...stylex.props(s.sectionBody)}>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.rowLabel)}>Compressed bytes</span>
              <span {...stylex.props(s.rowValue)}>{formatBytes(encodedLen)}</span>
            </div>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.rowLabel)}>Decoded RGBA</span>
              <span {...stylex.props(s.rowValue)}>
                {cpuKtx2
                  ? 'not allocated'
                  : cpuDecodedRgba !== null
                    ? formatBytes(cpuDecodedRgba)
                    : '—'}
              </span>
            </div>
            {cpuKtx2 && (
              <div {...stylex.props(s.cpuNote)}>
                KTX2 transcoder writes GPU-native blocks directly.
              </div>
            )}
          </div>
        </InfoSection>

        <InfoSection id="gpu" heading="GPU representation">
          <div {...stylex.props(s.sectionBody)}>
            <div {...stylex.props(s.row)}>
              <span {...stylex.props(s.rowLabel)}>Format</span>
              <span {...stylex.props(s.rowValue)}>
                {gpuStats?.formatLabel ?? '—'}
              </span>
            </div>
            {gpuStats && gpuStats.mips.length > 0 && (
              <div {...stylex.props(s.mipsTable)}>
                {gpuStats.mips.map((m, i) => (
                  <MipRow key={i} index={i} m={m} />
                ))}
              </div>
            )}
            <div {...stylex.props(s.totalRow)}>
              <span>{gpuStats ? `${gpuStats.mips.length} level${gpuStats.mips.length === 1 ? '' : 's'}` : '—'}</span>
              <span>{formatBytes(totalGpuBytes)}</span>
            </div>
            <div {...stylex.props(s.barWrap)}>
              <InfoBar ratio={gpuRatio} />
              <span {...stylex.props(s.barCaption)}>
                {gpuBaseline > 0 ? `${(gpuRatio * 100).toFixed(0)}% of RGBA8 baseline` : ''}
              </span>
            </div>
          </div>
        </InfoSection>

        <InfoSection id="hostGpu" heading="Host GPU support">
          <div {...stylex.props(s.sectionBody)}>
            <CapRow label="BPTC (BC7)" supported={caps.bptcSupported} />
            <CapRow label="ASTC" supported={caps.astcSupported} />
            <CapRow label="ETC2" supported={caps.etc2Supported} />
            <CapRow label="S3TC (DXT)" supported={caps.dxtSupported} />
            <CapRow label="PVRTC" supported={caps.pvrtcSupported} />
          </div>
        </InfoSection>
      </div>
    </Scrollable>
  )
}

function MipRow({ index, m }: { index: number; m: { width: number; height: number; bytes: number } }) {
  return (
    <>
      <span {...stylex.props(s.mipsCellMuted)}>Mip {index}</span>
      <span {...stylex.props(s.mipsCell)}>{m.width} × {m.height}</span>
      <span {...stylex.props(s.mipsCell)}>{formatBytes(m.bytes)}</span>
    </>
  )
}

function CapRow({ label, supported }: { label: string; supported: boolean }) {
  return (
    <div {...stylex.props(s.row)}>
      <span {...stylex.props(s.rowLabel)}>{label}</span>
      <span {...stylex.props(supported ? s.capCheck : s.capCross)}>
        {supported ? '✓' : '✗'}
      </span>
    </div>
  )
}
