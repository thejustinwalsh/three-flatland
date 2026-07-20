import { createRoot } from 'react-dom/client'
import App from './App'

// <StrictMode> is intentionally omitted for now, and this is a known gap rather
// than a preference.
//
// Symptom: with StrictMode enabled, pointer events on the sprite stop working
// against the Vite dev server. Production builds are unaffected. It reproduces
// under `pnpm test:consumer -- --only scaffold-react`, whose hover check asserts
// the frame changes when the cursor enters the canvas.
//
// Cause: not yet identified. It is NOT the camera wiring — three different
// implementations (frustum copy, effect + set({ camera }), and the callback ref
// used today) all reproduce it. Re-enable StrictMode here and run that smoke to
// re-test; if the hover check passes against the dev server, delete this note.
createRoot(document.getElementById('root')!).render(<App />)
