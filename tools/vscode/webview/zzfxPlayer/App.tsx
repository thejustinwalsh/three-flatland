import { useEffect, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Button } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { createClientBridge } from '@three-flatland/bridge/client'
import { playParams } from '../zzfx/audio'
import { fromArgs } from '../zzfx/params'

const s = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    width: '100%',
    height: '100%',
    background: vscode.bg,
    color: vscode.fg,
  },
  hint: {
    fontSize: '11px',
    color: vscode.descriptionFg,
  },
  error: {
    fontSize: '11px',
    color: vscode.errorFg,
  },
})

type PlayPayload = { params: number[] }

export function App() {
  const [params, setParams] = useState<number[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const play = async (raw: number[]) => {
    setError(null)
    try {
      await playParams(fromArgs(raw))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    let bridge: ReturnType<typeof createClientBridge>
    try {
      bridge = createClientBridge()
    } catch {
      // Standalone/dev — nothing to wire up; this panel only ever does
      // anything in response to a host-emitted play request.
      return
    }
    const off = bridge.on<PlayPayload>('zzfxPlayer/play', (p) => {
      setParams(p.params)
      void play(p.params)
    })
    void bridge.request('zzfxPlayer/ready')
    return () => off()
  }, [])

  return (
    <div {...stylex.props(s.root)}>
      <span {...stylex.props(s.hint)}>FL ZzFX Player — quick preview from a CodeLens</span>
      {/*
        Always-visible fallback: the automatic play attempt above may be
        blocked by autoplay policy (VS Code opening this panel from a
        command is not a "user gesture" inside THIS document — see
        extension/tools/zzfx/player.ts's doc comment). Clicking this
        button IS a real gesture in this webview's own frame, so it always
        works even when the automatic attempt didn't.
      */}
      <Button onClick={() => params && void play(params)} disabled={!params}>
        ▶ Play again
      </Button>
      {error && <span {...stylex.props(s.error)}>Play failed: {error}</span>}
    </div>
  )
}
