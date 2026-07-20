import { createRoot } from 'react-dom/client'
import App from './App'

// No <StrictMode> for now: @react-three/fiber 10.0.0-alpha.2's Canvas tears
// down its event listeners 500ms after a StrictMode dev double-mount
// (deferred unmount races the remount), leaving pointer events dead in dev.
// Restore StrictMode once the fiber alpha fixes its unmount timing.
createRoot(document.getElementById('root')!).render(<App />)
