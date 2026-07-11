import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import {
  Fullscreen,
  Container,
  Text,
  canvasInputProps,
  setPreferredColorScheme,
} from '@three-flatland/uikit/react'
import type { SvgProperties } from '@three-flatland/uikit/react'
import type { Container as VanillaContainer } from '@three-flatland/uikit'
import { colors, Button, Input } from '@three-flatland/uikit-default/react'
import * as LucideIcons from '@three-flatland/uikit-lucide/react'
import { SlugFontLoader } from '@three-flatland/slug/react'
import type { SlugFont } from '@three-flatland/slug'
import { suspend } from 'suspend-react'
import iconNames from './icon-names.json'
import iconTags from './icon-tags.json'

// ============================================================================
// uikit-lucide icon browser — the showcase for `@three-flatland/uikit-lucide`.
//
// Every lucide icon (1594 of them) is enumerated FROM SOURCE by
// `generate-icon-list.mts` (reads `../icons/*.svg` basenames → `icon-names.json`,
// plus `icon-tags.json` from lucide-static) and resolved to its component at
// runtime via `pascal()` — the exact kebab→PascalCase transform the package's own
// `scripts/generate.ts` uses, so coverage is total. No baked atlas: icons are
// live-parsed by `@three-flatland/slug`, and every rendered `Svg` batches into the
// SAME shared `SlugShapeSet` (one `InstancedShapeMesh`, ~1 draw call).
//
// The grid is VIRTUALIZED — only the rows in (or just around) the scroll viewport
// are rendered, so all 1594 matches scroll smoothly while only a viewport's worth
// of icons ever instance. Search matches by NAME or TAG.
//
// Flow: search → select → Copy manifest → `uikit-bake icons --manifest <file>`.
// The browser's OUTPUT is an `IconBakeManifest` (see packages/uikit/src/cli.ts)
// for the user to bake their own trimmed atlas — it does not ship one.
// ============================================================================

const ALL_ICONS: string[] = iconNames

/** Per-icon lowercased search haystack (`name + tags`), aligned to ALL_ICONS.
 * Built once at module load so filtering is a cheap substring scan. */
const HAYSTACKS: string[] = (() => {
  const tagMap = iconTags as Record<string, string[]>
  return ALL_ICONS.map((name) => `${name} ${(tagMap[name] ?? []).join(' ')}`.toLowerCase())
})()

/** Kebab basename → PascalCase export name. Mirrors uikit-lucide's own
 * `scripts/generate.ts` `getName`, so every entry resolves to a component. */
function pascal(kebab: string): string {
  return kebab[0]!.toUpperCase() + kebab.slice(1).replace(/-./g, (m) => m[1]!.toUpperCase())
}

/** The `/react` namespace, indexed dynamically by PascalCase name. */
const iconRegistry = LucideIcons as unknown as Record<string, ComponentType<SvgProperties>>

// Fixed chip geometry (uikit px) — a fixed cell makes the virtualization math
// exact: columns derive from the measured viewport width, and every icon's
// absolute position is a pure function of its filtered index.
const CHIP_W = 104
const CHIP_H = 96
const GAP = 8
const COL_STRIDE = CHIP_W + GAP
const ROW_STRIDE = CHIP_H + GAP
const OVERSCAN = 3
const CHIP_ICON_SIZE = 26
const INITIAL_COLUMNS = 10

/** The rendered slice: filtered indices [start, end) at `columns` per row. */
interface Window {
  start: number
  end: number
  columns: number
}

/** Shape emitted to the clipboard — an `IconBakeManifest` (uikit CLI). */
interface BakeManifest {
  out: string
  sources: Array<{ path: string; name: string }>
}

/** One selectable icon tile, absolutely positioned at its grid cell. */
const IconChip = memo(function IconChip({
  name,
  selected,
  onToggle,
  top,
  left,
}: {
  name: string
  selected: boolean
  onToggle: (name: string) => void
  top: number
  left: number
}) {
  const Icon = iconRegistry[pascal(name)]
  return (
    <Container
      positionType="absolute"
      positionTop={top}
      positionLeft={left}
      width={CHIP_W}
      height={CHIP_H}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap={8}
      padding={8}
      borderRadius={8}
      borderWidth={1}
      borderColor={selected ? colors.primary : colors.border}
      backgroundColor={selected ? colors.accent : colors.card}
      hover={{ borderColor: colors.primary }}
      cursor="pointer"
      onClick={() => onToggle(name)}
    >
      {Icon ? (
        <Icon
          width={CHIP_ICON_SIZE}
          height={CHIP_ICON_SIZE}
          color={selected ? colors.primary : colors.foreground}
        />
      ) : null}
      <Text
        fontSize={10}
        lineHeight="120%"
        textAlign="center"
        wordBreak="break-all"
        color={colors.mutedForeground}
      >
        {name}
      </Text>
    </Container>
  )
})

/**
 * Our fork renders text through Slug (analytic Bézier glyphs) instead of an MSDF
 * atlas, so a font must be provided explicitly — without one every `<Text>` is
 * invisible. Mirrors the uikit-default example.
 */
function useSlugFont(url: string): SlugFont {
  return suspend(
    () => SlugFontLoader.load(url, { forceRuntime: true }),
    [url, 'uikit-lucide-icon-browser-font']
  )
}

function IconBrowser() {
  const font = useSlugFont('./Inter-Regular.ttf')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set<string>())
  const [copyLabel, setCopyLabel] = useState('Copy manifest')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The scroll container (a vanilla uikit `Container`) exposes reactive
  // `scrollPosition` / `size` signals — we poll them in `useFrame` to drive
  // virtualization without a per-tick React render (see below).
  const scrollRef = useRef<VanillaContainer | null>(null)
  const [win, setWin] = useState<Window>({ start: 0, end: INITIAL_COLUMNS * 12, columns: INITIAL_COLUMNS })
  const lastWin = useRef<Window>(win)

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (q === '' ? ALL_ICONS : ALL_ICONS.filter((_, i) => HAYSTACKS[i]!.includes(q))),
    [q]
  )

  // Reset to the top whenever the filter changes — the old scroll offset is
  // meaningless against a different (often shorter) result set.
  useEffect(() => {
    const c = scrollRef.current
    if (c) c.scrollPosition.value = [0, 0]
    lastWin.current = { start: -1, end: -1, columns: 0 }
    setWin((w) => ({ start: 0, end: w.columns * 12, columns: w.columns }))
  }, [q])

  // Poll scroll offset + viewport size every frame; recompute the visible row
  // window and only `setState` when it actually changes (a row-boundary crossing
  // or a resize) — reading signals is cheap, React renders are not, so this is
  // where the thrash is avoided.
  useFrame(() => {
    const c = scrollRef.current
    if (c == null) return
    const size = c.size.value
    if (size == null) return
    const [w, h] = size
    const columns = Math.max(1, Math.floor((w - GAP) / COL_STRIDE))
    const scrollY = c.scrollPosition.value?.[1] ?? 0
    const firstRow = Math.max(0, Math.floor((scrollY - GAP) / ROW_STRIDE) - OVERSCAN)
    const rowsInView = Math.ceil(h / ROW_STRIDE) + OVERSCAN * 2 + 1
    const start = firstRow * columns
    const end = (firstRow + rowsInView) * columns
    const prev = lastWin.current
    if (prev.start !== start || prev.end !== end || prev.columns !== columns) {
      lastWin.current = { start, end, columns }
      setWin({ start, end, columns })
    }
  })

  const toggle = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const name of filtered) next.add(name)
      return next
    })
  }, [filtered])

  const clearSelection = useCallback(() => setSelected(new Set<string>()), [])

  const copyManifest = useCallback(() => {
    const names = [...selected].sort((a, b) => a.localeCompare(b))
    if (names.length === 0) return
    const manifest: BakeManifest = {
      out: 'icons.shapes.glb',
      sources: names.map((name) => ({
        path: `node_modules/@three-flatland/uikit-lucide/icons/${name}.svg`,
        name,
      })),
    }
    void navigator.clipboard.writeText(JSON.stringify(manifest, null, 2))
    setCopyLabel(`Copied ${names.length}`)
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyLabel('Copy manifest'), 1600)
  }, [selected])

  const selectedCount = selected.size
  const columns = Math.max(1, win.columns)
  const totalRows = Math.ceil(filtered.length / columns)
  const contentHeight = GAP + totalRows * ROW_STRIDE

  // Materialize only the visible window; each chip's cell is a pure function of
  // its filtered index, so positions stay stable as the window slides.
  const slice: Array<{ name: string; top: number; left: number }> = []
  const end = Math.min(win.end, filtered.length)
  for (let i = win.start; i < end; i++) {
    const name = filtered[i]!
    const row = Math.floor(i / columns)
    const col = i % columns
    slice.push({ name, top: GAP + row * ROW_STRIDE, left: GAP + col * COL_STRIDE })
  }

  return (
    <Fullscreen
      flexDirection="column"
      backgroundColor={colors.background}
      padding={24}
      gap={16}
      fontFamilies={{ inter: { normal: font } }}
    >
      <Container flexDirection="column" gap={4}>
        <Text fontSize={20} fontWeight="bold" color={colors.foreground}>
          uikit-lucide icon browser
        </Text>
        <Text fontSize={13} color={colors.mutedForeground}>
          Search by name or tag, select icons, Copy manifest, then bake: uikit-bake icons
          --manifest icons.json
        </Text>
      </Container>

      <Container flexDirection="row" alignItems="center" gap={12}>
        <Input
          flexGrow={1}
          placeholder="Search 1594 icons by name or tag…"
          value={query}
          onValueChange={setQuery}
        />
        <Text fontSize={13} color={colors.mutedForeground}>
          {selectedCount} selected
        </Text>
        <Button
          variant="outline"
          disabled={filtered.length === 0}
          onClick={selectAll}
          flexDirection="row"
          gap={8}
        >
          <LucideIcons.CheckCheck width={16} height={16} />
          <Text>Select all {filtered.length}</Text>
        </Button>
        <Button
          variant="secondary"
          disabled={selectedCount === 0}
          onClick={copyManifest}
          flexDirection="row"
          gap={8}
        >
          <LucideIcons.Copy width={16} height={16} />
          <Text>{copyLabel}</Text>
        </Button>
        <Button
          variant="outline"
          disabled={selectedCount === 0}
          onClick={clearSelection}
          flexDirection="row"
          gap={8}
        >
          <LucideIcons.X width={16} height={16} />
          <Text>Clear</Text>
        </Button>
      </Container>

      <Container
        ref={scrollRef}
        flexGrow={1}
        overflow="scroll"
        flexDirection="column"
        borderRadius={10}
        borderWidth={1}
        borderColor={colors.border}
        backgroundColor={colors.card}
      >
        {filtered.length === 0 ? (
          <Container flexGrow={1} alignItems="center" justifyContent="center" padding={48}>
            <Text color={colors.mutedForeground}>No icons match “{query}”.</Text>
          </Container>
        ) : (
          // Full-height content sizer so the scrollbar spans ALL matches; the
          // visible slice is absolutely positioned at its true grid offset.
          <Container width="100%" height={contentHeight} flexShrink={0} positionType="relative">
            {slice.map(({ name, top, left }) => (
              <IconChip
                key={name}
                name={name}
                selected={selected.has(name)}
                onToggle={toggle}
                top={top}
                left={left}
              />
            ))}
          </Container>
        )}
      </Container>

      <Text fontSize={12} color={colors.mutedForeground}>
        {filtered.length === ALL_ICONS.length
          ? `All ${ALL_ICONS.length} icons — scroll to browse.`
          : `${filtered.length} of ${ALL_ICONS.length} icons match “${query}” — scroll to browse.`}
      </Text>
    </Fullscreen>
  )
}

// A deterministic dark tool surface regardless of the host color scheme.
setPreferredColorScheme('dark')

export default function App() {
  return (
    // `canvasInputProps` stops the canvas pointer-down from blurring the hidden
    // <input> the search `Input` types into. Native DPR keeps Slug text crisp.
    <Canvas {...canvasInputProps} style={{ height: '100dvh', touchAction: 'none' }}>
      <color attach="background" args={['black']} />
      <ambientLight intensity={0.5} />
      <directionalLight intensity={0} position={[5, 1, 10]} />
      <Suspense fallback={null}>
        <IconBrowser />
      </Suspense>
    </Canvas>
  )
}
