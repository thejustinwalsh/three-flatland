/** @jsxImportSource preact */
/**
 * Header byte counters — running totals of inbound/outbound bytes seen
 * since session start. Updates ride the shared dashboard rAF tick so
 * high message rates don't thrash the header on their own.
 */
import { getProtocolStore } from '../protocol-store.js'
import { useFrameTick } from '../hooks.js'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function HeaderStats() {
  useFrameTick()
  const store = getProtocolStore()
  return (
    <div class="header-stats">
      <span title="Bytes received from providers">
        <span class="header-arrow-in">↓</span> {fmtBytes(store.bytesIn)}
      </span>
      <span title="Bytes sent to providers">
        <span class="header-arrow-out">↑</span> {fmtBytes(store.bytesOut)}
      </span>
    </div>
  )
}
