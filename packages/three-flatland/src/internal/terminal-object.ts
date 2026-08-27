const terminalObjects = new WeakSet<object>()

/** Mark an object as permanently disposed without publishing a public class member. */
export function markTerminalObject(object: object): void {
  terminalObjects.add(object)
}

/** Test the package-private terminal lifecycle boundary. */
export function isTerminalObject(object: object): boolean {
  return terminalObjects.has(object)
}
