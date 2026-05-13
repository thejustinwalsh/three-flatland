import { useWorld } from 'koota/react'
import { GameState } from '../traits'

interface Props {
  /** Top-3 high scores to preview. */
  topScores: { name: string; depthM: number; gems: number }[]
}

/**
 * Full-mode title attract screen. Tap anywhere transitions runState to
 * 'playing'.
 */
export function TitleAttract({ topScores }: Props) {
  const world = useWorld()

  return (
    <div
      onClick={() => {
        world.set(GameState, { runState: 'playing' })
      }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(10, 10, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        cursor: 'pointer',
        fontFamily: 'monospace',
        color: '#fcd34d',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 48,
            letterSpacing: '0.08em',
            textShadow: '0 0 12px rgba(252,211,77,0.5)',
          }}
        >
          DRILLER HOMIE
        </h1>
        <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: 14, letterSpacing: '0.1em' }}>
          DIG DEEP · GET GEMS · HELP (OR HARM)
        </p>
      </div>

      {topScores.length > 0 && (
        <div style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 8, fontSize: 12, minWidth: 220 }}>
          <div style={{ opacity: 0.6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            top runs
          </div>
          {topScores.slice(0, 3).map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ opacity: 0.8 }}>{i + 1}. {s.name}</span>
              <span>{s.depthM}m · ◆{s.gems}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ opacity: 0.5, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', animation: 'driller-blink 1s infinite' }}>
        tap to begin
      </div>
      <style>{`@keyframes driller-blink { 0%,50% { opacity: 0.5 } 51%,100% { opacity: 0.15 } }`}</style>
    </div>
  )
}
