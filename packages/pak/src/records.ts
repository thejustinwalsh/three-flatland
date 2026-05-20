// packages/pak/src/records.ts (temporary stub — replaced in Task 5)
import type { PakBufferDescriptor } from './schema'

export interface RecordCursor { readonly count: number }

export function makeCursor(
  _b: ArrayBuffer,
  _s: number,
  _d: PakBufferDescriptor,
  _n: string,
): RecordCursor {
  throw new Error('not implemented')
}
