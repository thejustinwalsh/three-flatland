export const RENDERER_FAILURE_MESSAGE = 'This example could not initialize WebGPU or WebGL 2 rendering.'

type InitializableRenderer = {
  init(): Promise<unknown>
  domElement: HTMLElement
}

/** Initialize a Three.js renderer, replacing its canvas with a useful failure state when no backend is available. */
export async function initializeRenderer(renderer: InitializableRenderer): Promise<boolean> {
  try {
    await renderer.init()
    return true
  } catch (error) {
    console.error('[three-flatland] Renderer initialization failed', error)
    renderer.domElement.remove()

    const fallback = document.createElement('div')
    fallback.role = 'status'
    fallback.textContent = RENDERER_FAILURE_MESSAGE
    Object.assign(fallback.style, {
      width: '100%',
      height: '100%',
      display: 'grid',
      placeItems: 'center',
      padding: '2rem',
      boxSizing: 'border-box',
      textAlign: 'center',
      color: 'inherit',
    })
    document.body.replaceChildren(fallback)
    return false
  }
}
