export class SparseSet {
  readonly dense: number[] = []
  private readonly sparse: number[] = []
  private denseCapacity = 0

  constructor(capacity = 0) {
    this.reserve(capacity)
  }

  get capacity(): number {
    return Math.min(this.sparse.length, this.denseCapacity)
  }

  reserve(capacity: number): void {
    for (let index = this.sparse.length; index < capacity; index++) this.sparse.push(-1)
    if (capacity <= this.denseCapacity) return

    const length = this.dense.length
    for (let index = this.denseCapacity; index < capacity; index++) this.dense.push(0)
    this.dense.length = length
    this.denseCapacity = capacity
  }

  has(value: number): boolean {
    const position = this.sparse[value]
    return position !== undefined && position >= 0 && this.dense[position] === value
  }

  indexOf(value: number): number {
    return this.has(value) ? this.sparse[value]! : -1
  }

  add(value: number): boolean {
    if (this.has(value)) return false
    this.sparse[value] = this.dense.length
    this.dense.push(value)
    return true
  }

  delete(value: number): boolean {
    const position = this.sparse[value]
    if (position === undefined || position < 0 || this.dense[position] !== value) return false

    const last = this.dense.pop()!
    this.sparse[value] = -1
    if (last !== value) {
      this.dense[position] = last
      this.sparse[last] = position
    }
    return true
  }

  clear(): void {
    for (const value of this.dense) this.sparse[value] = -1
    this.dense.length = 0
  }

  release(): void {
    this.dense.length = 0
    this.sparse.length = 0
    this.denseCapacity = 0
  }
}
