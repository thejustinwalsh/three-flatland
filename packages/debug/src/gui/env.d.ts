interface ImportMeta {
  readonly env?: {
    readonly PROD?: boolean
    readonly DEV?: boolean
    readonly MODE?: string
    [key: string]: unknown
  }
}
