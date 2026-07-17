import { useState } from 'react'
import { useWorld } from 'koota/react'
import { GameState } from '../traits'

const STORAGE_KEY = 'driller-leaderboard'
const MAX_ENTRIES = 10

export interface LeaderboardEntry {
  name: string
  depthM: number
  gems: number
  date: string
}

interface Props {
  onRestart: () => void
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (typeof value !== 'object' || value === null) return false
  return (
    'name' in value &&
    typeof value.name === 'string' &&
    'depthM' in value &&
    typeof value.depthM === 'number' &&
    Number.isFinite(value.depthM) &&
    'gems' in value &&
    typeof value.gems === 'number' &&
    Number.isFinite(value.gems) &&
    'date' in value &&
    typeof value.date === 'string'
  )
}

export function loadLeaderboard(): LeaderboardEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isLeaderboardEntry)
  } catch {
    return []
  }
}

export function saveLeaderboard(entry: LeaderboardEntry): LeaderboardEntry[] {
  const all = [...loadLeaderboard(), entry]
    .sort((a, b) => b.depthM - a.depthM || b.gems - a.gems)
    .slice(0, MAX_ENTRIES)
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  }
  return all
}

/**
 * End-of-run modal. Shows depth + gems, prompts for a name, saves to
 * localStorage, then re-emits via the onRestart callback so Game.tsx
 * can reset state.
 */
export function Leaderboard({ onRestart }: Props) {
  const world = useWorld()
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const [entries, setEntries] = useState<LeaderboardEntry[]>(loadLeaderboard)

  const gs = world.get(GameState)
  const depthM = gs?.deepestM ?? 0
  const gems = gs?.gems ?? 0

  const handleSubmit = (): void => {
    if (saved) return
    const finalName = (name.trim() || 'driller').slice(0, 12)
    const entry: LeaderboardEntry = {
      name: finalName,
      depthM,
      gems,
      date: new Date().toISOString(),
    }
    const updated = saveLeaderboard(entry)
    setEntries(updated)
    setSaved(true)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(10, 10, 20, 0.9)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: 'monospace',
        color: '#fcd34d',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 28, letterSpacing: '0.1em' }}>RUN OVER</h2>
      <div style={{ fontSize: 18, opacity: 0.9 }}>
        depth: <strong>{depthM}m</strong> · gems: <strong>◆ {gems}</strong>
      </div>

      {!saved ? (
        <>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="enter name"
            maxLength={12}
            autoFocus
            style={{
              padding: '8px 12px',
              background: 'rgba(0,0,0,0.5)',
              border: '1px solid #fcd34d',
              borderRadius: 4,
              color: '#fcd34d',
              fontFamily: 'monospace',
              fontSize: 14,
              textAlign: 'center',
              width: 200,
            }}
          />
          <button
            onClick={handleSubmit}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid #fcd34d',
              color: '#fcd34d',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              borderRadius: 4,
            }}
          >
            save
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            saved
          </div>
          <div
            style={{
              background: 'rgba(0,0,0,0.4)',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              minWidth: 240,
            }}
          >
            {entries.slice(0, 5).map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: e.name === name.trim() ? 1 : 0.7 }}>
                  {i + 1}. {e.name}
                </span>
                <span>
                  {e.depthM}m · ◆{e.gems}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={onRestart}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid #fcd34d',
              color: '#fcd34d',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              borderRadius: 4,
            }}
          >
            again?
          </button>
        </>
      )}
    </div>
  )
}
