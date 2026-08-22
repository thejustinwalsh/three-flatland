import { RENDERER_FAILURE_COLOR, RENDERER_FAILURE_MESSAGE } from './rendererFailure'

interface InitializableRenderer {
  init(): Promise<unknown>
}

/** Initialize Three's one renderer and present UI only if every backend fails. */
export async function initializeRenderer(renderer: InitializableRenderer): Promise<boolean> {
  try {
    await renderer.init()
    return true
  } catch (error) {
    renderStartupError(error)
    return false
  }
}

/** Present a terminal startup failure after Three has exhausted its renderer backends. */
export function renderStartupError(error: unknown): void {
  console.error('[three-flatland] Renderer initialization failed', error)
  document.querySelector('canvas')?.remove()

  const message = document.createElement('div')
  message.setAttribute('role', 'status')
  message.textContent = RENDERER_FAILURE_MESSAGE
  Object.assign(message.style, {
    width: '100%',
    height: '100%',
    display: 'grid',
    placeItems: 'center',
    padding: '2rem',
    boxSizing: 'border-box',
    textAlign: 'center',
    color: RENDERER_FAILURE_COLOR,
  })
  document.body.replaceChildren(message)
}
