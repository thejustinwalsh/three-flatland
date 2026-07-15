import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    // 'source' resolves workspace packages to their src/ entries so the example
    // always runs against the live fork, never a stale dist build.
    conditions: ['source'],
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
  // react-compiler auto-memoizes every component (matching the bento) — so the recycled grid's
  // per-slot work, the imperative scroll/virtualization, and the search never trigger redundant
  // re-renders. IconChip's manual memo still guards the hot path; this optimizes the parent.
  plugins: [react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })],
})
