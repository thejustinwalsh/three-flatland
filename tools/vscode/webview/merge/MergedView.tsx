import { useMergeState } from './mergeStore'

export function MergedView() {
  const { result } = useMergeState()
  return <pre style={{ padding: 12, fontSize: 11 }}>{JSON.stringify(result, null, 2)}</pre>
}
