import { useMergeState } from './mergeStore'

export function SourcesView() {
  const { sources } = useMergeState()
  return (
    <div style={{ padding: 12 }}>
      {sources.map((s) => (
        <div key={s.uri}>
          {s.alias} — {Object.keys(s.json.frames).length} frames
        </div>
      ))}
    </div>
  )
}
