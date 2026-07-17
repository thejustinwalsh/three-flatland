import type { ViteUserConfig } from 'astro'
import postcss, { type Rule, type AtRule, type Container, type Plugin as PostcssPlugin } from 'postcss'
import selectorParser from 'postcss-selector-parser'

type VitePlugin = NonNullable<ViteUserConfig['plugins']>[number]

/**
 * Semantic colorscheme transformer — rewrites every CSS rule whose
 * selector is gated on a `[data-theme='light']` / `[data-theme='dark']`
 * attribute (or its `:not()` inverse) into an equivalent rule wrapped
 * in `@media (prefers-color-scheme: …)`. The visible theme then follows
 * the OS preference directly via the cascade, without any JS-driven
 * `data-theme` attribute participating in the layout.
 *
 * The transform is purely semantic and AST-based:
 *   - PostCSS for parsing + rule manipulation
 *   - postcss-selector-parser for selector-AST surgery
 *   - No string regexes on CSS content
 *   - No vendored/copied CSS — upstream files stay in `node_modules`
 *
 * Three integration points all share the same AST transformer so we
 * catch every CSS that reaches the bundle:
 *
 *   1. `colorschemeTransformerVitePlugin()` — Vite `transform()` hook
 *      for `.css` files and Astro-extracted `<style>` blocks at module
 *      load time.
 *   2. `colorschemeTransformerPostcss()` — PostCSS plugin via Vite's
 *      `css.postcss.plugins`. Catches CSS that flows through Vite's
 *      CSS bundle stage (most third-party styles).
 *   3. `colorschemeTransformerBundlePlugin()` — Rollup `generateBundle`
 *      hook. Catches asset-emitted CSS like Expressive Code's
 *      `ec.{hash}.css`, which bypasses the module + PostCSS pipelines.
 *
 * Belt-and-suspenders across all three guarantees the `data-theme`
 * attribute is never load-bearing in the rendered output, regardless
 * of how upstream packages emit their CSS.
 */

// ── 1. Vite transform plugin (module-load time) ────────────────────────

export function colorschemeTransformerVitePlugin(): VitePlugin {
  return {
    name: 'starlight-theme:colorscheme-transformer:vite',
    enforce: 'pre',
    transform(code, id) {
      const isCss = /\.css(?:\?|$)/.test(id)
      const isAstroStyle = id.includes('.astro') && /[?&](?:type=style|lang\.css)/.test(id)
      if (!isCss && !isAstroStyle) return null
      if (!code.includes('data-theme')) return null
      return { code: transformCss(code), map: null }
    },
  }
}

// ── 2. PostCSS plugin (Vite CSS bundle stage) ──────────────────────────

export function colorschemeTransformerPostcss(): PostcssPlugin {
  return {
    postcssPlugin: 'starlight-theme:colorscheme-transformer:postcss',
    Once(root) {
      if (!root.toString().includes('data-theme')) return
      transformContainer(root)
    },
  }
}
colorschemeTransformerPostcss.postcss = true

// ── 3. Rollup generateBundle plugin (emitted-asset stage) ──────────────

/**
 * Catches CSS that gets emitted as a standalone asset rather than
 * processed through the module pipeline (e.g. Expressive Code's
 * `ec.{hash}.css`). Rewrites the asset source in place before Vite
 * writes the file to disk.
 */
export function colorschemeTransformerBundlePlugin(): VitePlugin {
  return {
    name: 'starlight-theme:colorscheme-transformer:bundle',
    generateBundle(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!fileName.endsWith('.css')) continue
        if (chunk.type !== 'asset') continue
        const source =
          typeof chunk.source === 'string' ? chunk.source : new TextDecoder().decode(chunk.source as Uint8Array)
        if (!source.includes('data-theme')) continue
        chunk.source = transformCss(source)
      }
    },
  }
}

// ── Pure transformer (exposed for tests) ───────────────────────────────

/**
 * Parse → transform AST → stringify. Exposed for unit testing.
 */
export function transformCss(css: string): string {
  const root = postcss.parse(css)
  transformContainer(root)
  return root.toString()
}

/** Walk a container recursively, transforming any data-theme-tagged rules. */
function transformContainer(container: Container): void {
  const rules: Rule[] = []
  container.each((node) => {
    if (node.type === 'rule') rules.push(node)
    else if (node.type === 'atrule') transformContainer(node)
  })
  for (const rule of rules) transformRule(rule)
}

function transformRule(rule: Rule): void {
  if (!rule.selector.includes('data-theme')) return

  const partitions = partitionSelectors(rule.selector)

  const replacements: (Rule | AtRule)[] = []

  if (partitions.untheme.length > 0) {
    const clone = rule.clone()
    clone.selector = partitions.untheme.join(', ')
    replacements.push(clone)
  }
  if (partitions.light.length > 0) {
    replacements.push(wrapInMedia(rule, 'light', partitions.light))
  }
  if (partitions.dark.length > 0) {
    replacements.push(wrapInMedia(rule, 'dark', partitions.dark))
  }

  rule.replaceWith(...replacements)
}

function wrapInMedia(source: Rule, theme: 'light' | 'dark', selectors: string[]): AtRule {
  const inner = source.clone()
  inner.selector = selectors.join(', ')
  const media = postcss.atRule({
    name: 'media',
    params: `(prefers-color-scheme: ${theme})`,
  })
  media.append(inner)
  return media
}

interface Partitions {
  untheme: string[]
  light: string[]
  dark: string[]
}

function partitionSelectors(selectorList: string): Partitions {
  const partitions: Partitions = { untheme: [], light: [], dark: [] }

  const processor = selectorParser((root) => {
    root.each((selector) => {
      const themes = collectThemeConstraints(selector)
      if (themes.size === 0) {
        partitions.untheme.push(selector.toString().trim())
        return
      }
      if (themes.size > 1) {
        return
      }
      const [theme] = [...themes]
      const stripped = stripThemePredicates(selector)
      ;(theme === 'light' ? partitions.light : partitions.dark).push(stripped)
    })
  })

  processor.processSync(selectorList)
  return partitions
}

function collectThemeConstraints(selector: selectorParser.Selector): Set<'light' | 'dark'> {
  const constraints = new Set<'light' | 'dark'>()
  selector.walk((node) => {
    if (node.type === 'attribute') {
      const attr = node as selectorParser.Attribute
      if (attr.attribute !== 'data-theme') return
      const value = attr.value
      if (value !== 'light' && value !== 'dark') return
      const inNot = isInsideNotPseudo(node)
      constraints.add(inNot ? (value === 'light' ? 'dark' : 'light') : value)
    }
  })
  return constraints
}

function isInsideNotPseudo(node: selectorParser.Node): boolean {
  let parent: selectorParser.Container | undefined = node.parent
  while (parent) {
    if (parent.type === 'pseudo' && (parent as selectorParser.Pseudo).value === ':not') {
      return true
    }
    parent = parent.parent
  }
  return false
}

function stripThemePredicates(selector: selectorParser.Selector): string {
  const clone = selector.clone()

  const attrsToRemove: selectorParser.Node[] = []
  clone.walk((node) => {
    if (node.type === 'attribute') {
      const attr = node as selectorParser.Attribute
      if (attr.attribute === 'data-theme') attrsToRemove.push(node)
    }
  })
  attrsToRemove.forEach((n) => n.remove())

  const pseudosToRemove: selectorParser.Node[] = []
  clone.walk((node) => {
    if (node.type === 'pseudo') {
      const pseudo = node as selectorParser.Pseudo
      if (pseudo.value !== ':not') return
      const allEmpty = pseudo.nodes.every((sub) => sub.nodes.length === 0)
      if (allEmpty) pseudosToRemove.push(pseudo)
    }
  })
  pseudosToRemove.forEach((n) => n.remove())

  const result = clone.toString().trim()
  return result.length > 0 ? result : ':root'
}
