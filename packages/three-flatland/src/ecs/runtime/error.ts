type ErrorType = ErrorConstructor | RangeErrorConstructor | TypeErrorConstructor

export function fail(message: string, Type: ErrorType = Error): never {
  throw new Type(`three-flatland: ${message}`)
}
