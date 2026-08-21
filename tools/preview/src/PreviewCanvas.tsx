import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Canvas } from '@react-three/fiber/webgpu'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'

const s = stylex.create({
  fallback: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: space.lg,
    textAlign: 'center',
    pointerEvents: 'none',
    color: vscode.descriptionFg,
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
  },
})

/**
 * R3F also places Canvas fallback content inside the healthy `<canvas>` for
 * non-visual browser fallback. Expose the status to assistive technology only
 * when alpha.3 moves it into the visible DOM after renderer setup fails.
 */
export function RendererFallback() {
  const ref = useRef<HTMLDivElement>(null)
  const [insideCanvas, setInsideCanvas] = useState(true)

  useLayoutEffect(() => {
    const next = ref.current?.parentElement?.tagName === 'CANVAS'
    setInsideCanvas((current) => (current === next ? current : next))
  }, [])

  return (
    <div
      ref={ref}
      role={insideCanvas ? undefined : 'status'}
      aria-hidden={insideCanvas || undefined}
      {...stylex.props(s.fallback)}
    >
      WebGPU preview unavailable.
    </div>
  )
}

/**
 * Canvas boundary shared by every editor preview. A non-null fallback is
 * required by R3F alpha.3 to keep renderer initialization failures from being
 * rethrown through the surrounding webview's React root.
 */
export function PreviewCanvas(props: ComponentProps<typeof Canvas>) {
  return <Canvas {...props} fallback={<RendererFallback />} />
}
