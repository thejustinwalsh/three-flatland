import { useEffect, useRef } from 'react'

// Stylized QR via qr-code-styling: gem-gradient rounded modules, the FL logo in
// the center, on a white card so it still scans. High error correction so the
// centered logo doesn't break it.
export function StyledQR({ data, size = 208 }: { data: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const QRCodeStyling = (await import('qr-code-styling')).default
      if (cancelled || !ref.current) return
      ref.current.innerHTML = ''
      const qr = new QRCodeStyling({
        width: size,
        height: size,
        type: 'svg',
        data,
        image: `${import.meta.env.BASE_URL}slides/make-web-games/flatland-logo.svg`,
        qrOptions: { errorCorrectionLevel: 'H' },
        margin: 4,
        dotsOptions: {
          type: 'rounded',
          gradient: {
            type: 'linear',
            rotation: 0.8,
            colorStops: [
              { offset: 0, color: '#1098c7' },
              { offset: 0.5, color: '#8b3ff0' },
              { offset: 1, color: '#c62f52' },
            ],
          },
        },
        backgroundOptions: { color: '#ffffff' },
        cornersSquareOptions: { type: 'extra-rounded', color: '#8b3ff0' },
        cornersDotOptions: { type: 'dot', color: '#1098c7' },
        imageOptions: { margin: 4, imageSize: 0.26, hideBackgroundDots: true, crossOrigin: 'anonymous' },
      })
      qr.append(ref.current)
    })()
    return () => {
      cancelled = true
    }
  }, [data, size])

  return (
    <div
      ref={ref}
      style={{ width: size, height: size, background: '#fff', borderRadius: '0.9rem', padding: '0.7rem', lineHeight: 0 }}
    />
  )
}
