import { createRoot } from 'react-dom/client'
import App from './App'

// No <StrictMode> yet. @react-three/fiber 10.0.0-alpha.2 tears its Canvas event
// listeners down on a deferred timer; under React 19's StrictMode dev
// double-mount that timer fires against the live remounted root, so pointer
// events go dead shortly after load — in dev only, production is unaffected.
//
// This is verified rather than folklore: the consumer smoke hovers the sprite
// and asserts the frame changes. With StrictMode that check fails against the
// dev server and passes against the production build; without it, both pass.
// Restore StrictMode once the fiber alpha fixes its unmount timing — the smoke
// will tell you when it is safe.
createRoot(document.getElementById('root')!).render(<App />)
