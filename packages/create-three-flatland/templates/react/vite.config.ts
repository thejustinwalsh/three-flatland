import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // React Compiler. It memoises components and hook results automatically, so
    // the render path stays cheap without hand-written useMemo/useCallback
    // scaffolding everywhere. Wired through the plugin's Babel options — the
    // same shape create-vite uses for its React Compiler variant.
    react({ babel: { plugins: ['babel-plugin-react-compiler'] } }),
  ],
})
