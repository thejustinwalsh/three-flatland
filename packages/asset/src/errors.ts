export type AssetErrorCode = 'BAD_GLB' | 'BAD_EXTENSION' | 'BAD_ACCESS'

export class AssetError extends Error {
  code: AssetErrorCode

  constructor(code: AssetErrorCode, message: string) {
    super(message)
    this.name = 'AssetError'
    this.code = code
  }
}
