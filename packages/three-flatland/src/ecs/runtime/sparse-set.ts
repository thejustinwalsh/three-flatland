export class SparseSet {
  readonly dense: number[] = []
  private readonly sparse: Array<number | undefined> = []

  has(value: number): boolean {
    const position = this.sparse[value]
    return position !== undefined && this.dense[position] === value
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
    if (position === undefined || this.dense[position] !== value) return false

    const last = this.dense.pop()!
    this.sparse[value] = undefined
    if (last !== value) {
      this.dense[position] = last
      this.sparse[last] = position
    }
    return true
  }

  clear(): void {
    for (const value of this.dense) this.sparse[value] = undefined
    this.dense.length = 0
  }

  release(): void {
    this.dense.length = 0
    this.sparse.length = 0
  }
}
