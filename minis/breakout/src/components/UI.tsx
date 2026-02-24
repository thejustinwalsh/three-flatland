import type { GameMode } from '../types'

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
  const displayScore = Math.floor(score)
  const displayHigh = Math.floor(highScore)
  const showHud = mode === 'ready' || mode === 'playing'
  const displayMultiplier = Math.floor(multiplier)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: '"Silkscreen", "Courier New", monospace',
        color: '#fff',
        fontSize: 14,
        textShadow: '2px 2px 0 #0a0a23',
      }}
    >
      {/* Score + multiplier */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
        }}
      >
        {showHud && (
          <div>
            {displayScore}
            {displayMultiplier > 1 && (
              <span style={{ color: '#ffd700', marginLeft: 8 }}>
                x{displayMultiplier}
              </span>
            )}
          </div>
        )}
        {showHud && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4, opacity: 0.7 }}>
            {Array.from({ length: Math.max(0, lives - 1) }, (_, i) => (
              <svg key={i} width="7" height="7" viewBox="0 0 8 8" style={{ imageRendering: 'pixelated' }}>
                <rect x="2" y="0" width="4" height="1" fill="currentColor" />
                <rect x="1" y="1" width="6" height="1" fill="currentColor" />
                <rect x="0" y="2" width="8" height="4" fill="currentColor" />
                <rect x="1" y="6" width="6" height="1" fill="currentColor" />
                <rect x="2" y="7" width="4" height="1" fill="currentColor" />
              </svg>
            ))}
          </div>
        )}
      </div>

      {/* Level indicator (center top) */}
      {showHud && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            opacity: 0.7,
            fontSize: 12,
          }}
        >
          LV{level}
        </div>
      )}

      {/* High score + level */}
      {displayHigh > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 12,
            textAlign: 'right',
          }}
        >
          <div>{displayHigh}</div>
          <div style={{ fontSize: 10, opacity: 0.7 }}>
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
            background: 'rgba(10, 10, 35, 0.7)',
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 8 }}>GAME OVER</div>
          <div>{displayScore}</div>
          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
            LV{level}
          </div>
        </div>
      )}

      {/* Load pixel font + CSS animation */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Silkscreen&display=swap');
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
