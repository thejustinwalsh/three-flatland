import type { GameMode } from '../types'

let stylesInjected = false
function injectStyles() {
  if (stylesInjected) return
  stylesInjected = true

  const style = document.createElement('style')
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `
  document.head.appendChild(style)
}

interface UIProps {
  mode: GameMode
  score: number
  highScore: number
  highScoreLevel: number
  level: number
  lives: number
  multiplier: number
}

export function GameUI({ mode, score, highScore, highScoreLevel, level, lives, multiplier }: UIProps) {
  injectStyles()
  const displayScore = Math.floor(score)
  const displayHigh = Math.floor(highScore)
  const showHud = mode === 'ready' || mode === 'playing'
  const displayMultiplier = Math.floor(multiplier)

  // Life indicator SVG — size scales with container via cqi
  const lifeIcon = (i: number) => (
    <svg key={i} style={{ width: '1.8cqi', height: '1.8cqi', imageRendering: 'pixelated' }} viewBox="0 0 8 8">
      <rect x="2" y="0" width="4" height="1" fill="currentColor" />
      <rect x="1" y="1" width="6" height="1" fill="currentColor" />
      <rect x="0" y="2" width="8" height="4" fill="currentColor" />
      <rect x="1" y="6" width="6" height="1" fill="currentColor" />
      <rect x="2" y="7" width="4" height="1" fill="currentColor" />
    </svg>
  )

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        containerType: 'inline-size',
        fontFamily: '"Silkscreen", "Courier New", monospace',
        color: '#fff',
        fontSize: 'clamp(7px, 2.8cqi, 13px)',
        textShadow: '0.5cqi 0.5cqi 0 #0a0a23',
      }}
    >
      {/* Score + lives (left) */}
      {showHud && (
        <div
          style={{
            position: 'absolute',
            top: '1cqi',
            left: '2cqi',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5cqi',
          }}
        >
          <div style={{ lineHeight: 1 }}>
            {displayScore}
            {displayMultiplier > 1 && (
              <span style={{ color: '#ffd700', marginLeft: '2cqi' }}>
                x{displayMultiplier}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.8cqi', opacity: 0.7 }}>
            {Array.from({ length: Math.max(0, lives - 1) }, (_, i) => lifeIcon(i))}
          </div>
        </div>
      )}

      {/* Level indicator (center top) */}
      {showHud && (
        <div
          style={{
            position: 'absolute',
            top: '1cqi',
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: 0.7,
            fontSize: 'clamp(7px, 3cqi, 14px)',
          }}
        >
          LV{level}
        </div>
      )}

      {/* High score + level (right) */}
      {showHud && displayHigh > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '1cqi',
            right: '2cqi',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '0.5cqi',
          }}
        >
          <div style={{ lineHeight: 1 }}>{displayHigh}</div>
          <div style={{ fontSize: 'clamp(6px, 2.5cqi, 12px)', opacity: 0.7, lineHeight: 1 }}>
            LV{highScoreLevel || 1}
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {mode === 'gameover' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1cqi',
            background: 'rgba(10, 10, 35, 0.7)',
          }}
        >
          <div style={{ fontSize: 'clamp(12px, 4.5cqi, 22px)' }}>GAME OVER</div>
          <div>{displayScore}</div>
          <div style={{ fontSize: 'clamp(6px, 2.5cqi, 12px)', opacity: 0.7 }}>
            LV{level}
          </div>
        </div>
      )}

    </div>
  )
}
