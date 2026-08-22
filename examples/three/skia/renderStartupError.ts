export const RENDERER_FAILURE_MESSAGE = 'This example could not initialize rendering.'
export const RENDERER_FAILURE_COLOR = '#f4f7fb'

/** Present a terminal startup failure after Three has exhausted its renderer backends. */
export function renderStartupError(error: unknown): void {
  console.error('[three-flatland] Example startup failed', error)
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
