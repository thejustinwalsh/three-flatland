/**
 * Registry view — one group visible at a time. Header reads
 * `◀ groupName ▶`; arrows cycle through the groups the provider has
 * published. Below the header, every entry in the active group is
 * stacked (one bar chart per entry) so you see the full module in one
 * glance. Hidden while the registry is empty.
 *
 * Groups are derived from the part of each entry name before the
 * first `.` (`forwardPlus.lightCounts` + `forwardPlus.tileScores` →
 * group `forwardPlus`). Names without a dot land in an `ungrouped`
 * bucket.
 */

import type { FolderApi, Pane } from 'tweakpane'

import type { DevtoolsClient, RegistryEntrySnapshot } from './devtools-client.js'

export interface RegistryViewHandle {
  readonly element: HTMLElement
  dispose(): void
}

interface EntryRow {
  name: string
  shortName: string
  row: HTMLDivElement
  nameLabel: HTMLSpanElement
  valueLabel: HTMLSpanElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
  lastVersion: number
}

interface GroupUI {
  group: string
  container: HTMLDivElement
  entries: Map<string, EntryRow>
}

const BAR_HEIGHT = 24
const BAR_WIDTH = 240

const FILL_BY_KIND: Record<string, string> = {
  float: '#47cca9',
  int: '#47cc6a',
  uint: '#ffa347',
  bits: '#d94c87',
  float2: '#9d7aff',
  float3: '#9d7aff',
  float4: '#9d7aff',
}

function splitName(name: string): { group: string; short: string } {
  const dot = name.indexOf('.')
  if (dot === -1) return { group: 'ungrouped', short: name }
  return { group: name.slice(0, dot), short: name.slice(dot + 1) }
}

export function addRegistryView(
  parent: Pane | FolderApi,
  client: DevtoolsClient,
): RegistryViewHandle {
  const blade = parent.addBlade({ view: 'separator' }) as unknown as {
    element: HTMLElement
    dispose(): void
  }
  const bladeEl = blade.element
  bladeEl.innerHTML = ''
  bladeEl.className = 'tp-cntv'
  // Hidden until entries exist. Set `display:flex` (not `''`) when
  // showing so the children can centre-align via flex rules — toggling
  // to '' would revert to the stylesheet's `block`, breaking layout.
  // `background` lays a ~30% black overlay over whatever Tweakpane's
  // base colour is, visually sinking this blade back relative to the
  // stats blades above it.
  bladeEl.style.cssText = 'display:none;flex-direction:column;background:rgba(0,0,0,0.3)'

  // Header: "◀ group ▶" — group name centred, arrows on either end.
  // Clicking the centre label toggles collapse. No fold chevron — the
  // visible body IS the indicator.
  const header = document.createElement('div')
  // Symmetric 2em arrow columns so the 1fr middle is the blade's true
  // centre regardless of arrow-glyph rendering width. `cursor:pointer`
  // on the whole header so the collapse target isn't just the text
  // glyphs; arrows stop propagation so they don't also toggle.
  header.style.cssText = [
    'display:grid',
    'grid-template-columns:2em 1fr 2em',
    'align-items:center',
    'padding:4px 6px 6px',
    'font-size:11px',
    'color:var(--tp-label-foreground-color)',
    'user-select:none',
    '-webkit-user-select:none',
    'font-variant-numeric:tabular-nums',
    'cursor:pointer',
  ].join(';')
  // Match the provider-switcher arrow styling verbatim so both cycle
  // controls feel identical. `padding:0 4px` gives a more generous
  // click target than relying on the grid cell alone.
  const arrowStyle = 'cursor:pointer;padding:0 4px;opacity:0.8;font-family:ui-monospace,monospace;text-align:center'
  const prevBtn = document.createElement('span')
  prevBtn.textContent = '◀'
  prevBtn.style.cssText = arrowStyle
  prevBtn.setAttribute('role', 'button')
  prevBtn.setAttribute('aria-label', 'Previous registry group')
  const groupLabel = document.createElement('span')
  // Intentionally no `cursor:pointer` here — the click handler lives on
  // the header row, so the whole row shares one hit target. Giving the
  // label its own cursor/handler caused inconsistent hit-testing when
  // the user clicked on the label's text-vs-padding boundary.
  groupLabel.style.cssText = 'font-weight:500;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none'
  const nextBtn = document.createElement('span')
  nextBtn.textContent = '▶'
  nextBtn.style.cssText = arrowStyle
  nextBtn.setAttribute('role', 'button')
  nextBtn.setAttribute('aria-label', 'Next registry group')
  header.appendChild(prevBtn)
  header.appendChild(groupLabel)
  header.appendChild(nextBtn)

  const body = document.createElement('div')
  body.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:2px 6px 6px'

  bladeEl.appendChild(header)
  bladeEl.appendChild(body)

  const groups = new Map<string, GroupUI>()
  let activeGroup: string | null = null
  // Start collapsed — don't stream registry data until the user opens
  // the view. `setRegistryFilter([])` below keeps the provider quiet.
  let collapsed = true
  body.style.display = 'none'

  /** Push the currently-visible entry names up to the client. */
  function syncFilter(): void {
    if (collapsed || activeGroup === null) {
      client.setRegistryFilter([])
      return
    }
    const g = groups.get(activeGroup)
    if (!g) {
      client.setRegistryFilter([])
      return
    }
    const names: string[] = []
    for (const row of g.entries.values()) names.push(row.name)
    client.setRegistryFilter(names)
  }

  const toggleCollapse = (e: Event): void => {
    // Stop propagation so the separator-blade shim below doesn't ever
    // see this click (Tweakpane can sometimes process blade pointer
    // events in a way that interferes with custom handlers).
    e.stopPropagation()
    collapsed = !collapsed
    body.style.display = collapsed ? 'none' : 'flex'
    if (!collapsed && activeGroup !== null) {
      const g = groups.get(activeGroup)
      if (g) {
        g.container.style.display = 'flex'
        for (const row of g.entries.values()) row.lastVersion = -1
      }
    }
    syncFilter()
  }
  header.addEventListener('click', toggleCollapse)
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); cycle(-1) })
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); cycle(1) })

  function ensureGroup(name: string): GroupUI {
    let g = groups.get(name)
    if (g) return g
    const container = document.createElement('div')
    container.style.cssText = 'display:none;flex-direction:column;gap:4px'
    body.appendChild(container)
    g = { group: name, container, entries: new Map() }
    groups.set(name, g)
    return g
  }

  function destroyGroup(name: string): void {
    const g = groups.get(name)
    if (!g) return
    g.container.remove()
    groups.delete(name)
    if (activeGroup === name) activeGroup = null
  }

  function ensureEntryRow(g: GroupUI, name: string, shortName: string): EntryRow {
    const existing = g.entries.get(shortName)
    if (existing) return existing

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;flex-direction:column;gap:2px'

    const head = document.createElement('div')
    head.style.cssText = [
      'display:flex',
      'align-items:baseline',
      'gap:6px',
      'font-size:10px',
      'line-height:1.2',
      'font-family:var(--tp-base-font-family, ui-monospace, monospace)',
      'font-variant-numeric:tabular-nums',
      'color:var(--tp-monitor-foreground-color)',
    ].join(';')
    const nameLabel = document.createElement('span')
    nameLabel.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tp-label-foreground-color)'
    nameLabel.textContent = shortName
    const valueLabel = document.createElement('span')
    valueLabel.style.cssText = 'opacity:0.75;white-space:nowrap'
    head.appendChild(nameLabel)
    head.appendChild(valueLabel)

    const canvas = document.createElement('canvas')
    canvas.width = BAR_WIDTH
    canvas.height = BAR_HEIGHT
    canvas.style.cssText = `width:100%;height:${BAR_HEIGHT}px;background:rgba(0,2,28,0.45);border-radius:2px`

    row.appendChild(head)
    row.appendChild(canvas)
    g.container.appendChild(row)

    const entry: EntryRow = {
      name,
      shortName,
      row,
      nameLabel,
      valueLabel,
      canvas,
      ctx: canvas.getContext('2d'),
      lastVersion: -1,
    }
    g.entries.set(shortName, entry)
    return entry
  }

  function destroyEntryRow(g: GroupUI, shortName: string): void {
    const row = g.entries.get(shortName)
    if (!row) return
    row.row.remove()
    g.entries.delete(shortName)
  }

  function setActiveGroup(name: string | null): void {
    activeGroup = name
    for (const [groupName, g] of groups) {
      g.container.style.display = groupName === name && !collapsed ? 'flex' : 'none'
    }
    groupLabel.textContent = name ?? '—'
    if (name !== null) {
      const g = groups.get(name)
      if (g) for (const row of g.entries.values()) row.lastVersion = -1
    }
    syncFilter()
  }

  function cycle(delta: number): void {
    const names = Array.from(groups.keys())
    if (names.length === 0) return
    const idx = activeGroup !== null ? names.indexOf(activeGroup) : -1
    const next = names[(idx + delta + names.length) % names.length]!
    setActiveGroup(next)
  }
  // (arrow click handlers wired above, alongside the toggle.)

  function renderBars(row: EntryRow, kind: string, sample: Float32Array | Uint32Array | Int32Array, isSigned: boolean): { min: number; max: number; mean: number } {
    const ctx = row.ctx
    const w = row.canvas.width
    const h = row.canvas.height
    let min = Infinity
    let max = -Infinity
    let sum = 0
    const n = sample.length
    for (let i = 0; i < n; i++) {
      const v = sample[i]!
      if (v < min) min = v
      if (v > max) max = v
      sum += v
    }
    const mean = n > 0 ? sum / n : 0

    if (!ctx) return { min, max, mean }
    ctx.clearRect(0, 0, w, h)
    if (n === 0 || !Number.isFinite(min) || !Number.isFinite(max)) return { min, max: 0, mean }

    const zeroY = isSigned ? h / 2 : h
    const scale = isSigned ? (h / 2) / Math.max(Math.abs(min), Math.abs(max) || 1) : h / (max || 1)

    ctx.fillStyle = FILL_BY_KIND[kind] ?? '#47cca9'
    const bw = Math.max(1, w / n)
    for (let i = 0; i < n; i++) {
      const v = sample[i]!
      const x = Math.floor((i / n) * w)
      const bh = v * scale
      if (isSigned) {
        if (bh >= 0) ctx.fillRect(x, zeroY - bh, Math.ceil(bw), bh)
        else ctx.fillRect(x, zeroY, Math.ceil(bw), -bh)
      } else {
        ctx.fillRect(x, zeroY - bh, Math.ceil(bw), bh)
      }
    }
    if (isSigned) {
      ctx.fillStyle = 'rgba(240, 237, 216, 0.2)'
      ctx.fillRect(0, zeroY, w, 1)
    }
    return { min, max, mean }
  }

  function renderBits(row: EntryRow, sample: Uint32Array, count: number): { ones: number; total: number } {
    const ctx = row.ctx
    const w = row.canvas.width
    const h = row.canvas.height
    if (!ctx) return { ones: 0, total: 0 }
    ctx.clearRect(0, 0, w, h)
    const totalBits = count * 32
    if (totalBits === 0) return { ones: 0, total: 0 }
    let ones = 0
    const px = w / totalBits
    ctx.fillStyle = FILL_BY_KIND.bits!
    for (let i = 0; i < count; i++) {
      const word = sample[i]! >>> 0
      for (let b = 0; b < 32; b++) {
        if ((word >>> b) & 1) {
          ones++
          const bitIdx = i * 32 + b
          const x = Math.floor(bitIdx * px)
          ctx.fillRect(x, 2, Math.max(1, Math.ceil(px)), h - 4)
        }
      }
    }
    return { ones, total: totalBits }
  }

  function renderEntry(row: EntryRow, entry: RegistryEntrySnapshot): void {
    if (row.lastVersion === entry.version) return
    row.lastVersion = entry.version
    row.nameLabel.title = `${entry.name} · ${entry.kind} · ${entry.count}`

    const kind = entry.kind
    if (kind === 'bits') {
      const { ones, total } = renderBits(row, entry.sample as Uint32Array, entry.count)
      row.valueLabel.textContent = `${ones} / ${total}`
      return
    }

    if (kind === 'float2' || kind === 'float3' || kind === 'float4') {
      const stride = kind === 'float2' ? 2 : kind === 'float3' ? 3 : 4
      const n = Math.floor(entry.sample.length / stride)
      const mags = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let sq = 0
        for (let c = 0; c < stride; c++) {
          const v = entry.sample[i * stride + c]!
          sq += v * v
        }
        mags[i] = Math.sqrt(sq)
      }
      const stats = renderBars(row, kind, mags, false)
      row.valueLabel.textContent = `${n}×${stride}  μ=${stats.mean.toFixed(2)}`
      return
    }

    const isSigned = kind === 'int' || kind === 'float'
    const stats = renderBars(row, kind, entry.sample, isSigned)
    const fmt = (v: number): string => {
      if (!Number.isFinite(v)) return '—'
      if (kind === 'uint' || kind === 'int') return Math.round(v).toString()
      return v.toFixed(2)
    }
    row.valueLabel.textContent = `μ=${fmt(stats.mean)}  ${fmt(stats.min)}–${fmt(stats.max)}`
  }

  const unsubscribe = client.addListener((state) => {
    const registry = state.registry

    const seen = new Map<string, Set<string>>()
    for (const [name] of registry) {
      const { group, short } = splitName(name)
      let bucket = seen.get(group)
      if (!bucket) {
        bucket = new Set()
        seen.set(group, bucket)
      }
      bucket.add(short)
    }

    // Prune.
    for (const [groupName, g] of groups) {
      const bucket = seen.get(groupName)
      if (!bucket) {
        destroyGroup(groupName)
        continue
      }
      for (const shortName of g.entries.keys()) {
        if (!bucket.has(shortName)) destroyEntryRow(g, shortName)
      }
    }

    // Ensure every row exists first (so cycling never lands on a
    // missing container), but defer rendering until active group is
    // pinned below.
    for (const [name] of registry) {
      const { group, short } = splitName(name)
      const g = ensureGroup(group)
      ensureEntryRow(g, name, short)
    }

    // Establish / repair active group.
    if (groups.size === 0) {
      activeGroup = null
      groupLabel.textContent = '—'
    } else if (activeGroup === null || !groups.has(activeGroup)) {
      setActiveGroup(groups.keys().next().value as string)
    } else {
      groupLabel.textContent = activeGroup
      const g = groups.get(activeGroup)!
      g.container.style.display = collapsed ? 'none' : 'flex'
    }

    // Only re-render the rows the user can actually see. Inactive
    // groups + collapsed state = no canvas work at all.
    if (!collapsed && activeGroup !== null) {
      const g = groups.get(activeGroup)
      if (g) {
        for (const [shortName, row] of g.entries) {
          const entry = registry.get(`${activeGroup}.${shortName}`) ?? registry.get(shortName)
          if (entry) renderEntry(row, entry)
        }
      }
    }

    // Arrows stay visible (so the header stays symmetric) but dim when
    // there's nowhere to cycle to.
    const multi = groups.size > 1
    const arrowOpacity = multi ? '0.8' : '0.25'
    const arrowPointer = multi ? 'pointer' : 'default'
    prevBtn.style.opacity = arrowOpacity
    nextBtn.style.opacity = arrowOpacity
    prevBtn.style.cursor = arrowPointer
    nextBtn.style.cursor = arrowPointer

    // Use `flex` (not `''`) so children can centre-align via flex.
    bladeEl.style.display = registry.size > 0 ? 'flex' : 'none'

    // Resync the filter — an entry may have been added/removed in the
    // active group since the last call. Client dedupes identical
    // subscribes so this is cheap on the quiet path.
    syncFilter()
  })

  return {
    element: bladeEl,
    dispose() {
      unsubscribe()
      groups.clear()
      blade.dispose()
    },
  }
}
