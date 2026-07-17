import { describe, expect, it } from 'vitest'
import { transformCss as rewrite } from './colorscheme-transformer'

/**
 * Normalize whitespace so test assertions don't have to mirror exact
 * PostCSS output formatting (which can vary by version and node type).
 */
const norm = (css: string) =>
  css
    .replace(/\s+/g, ' ')
    .replace(/\s*([{},:;])\s*/g, '$1')
    .trim()

describe('vendor-data-theme-rewrite', () => {
  describe('positive `[data-theme=…]` predicates', () => {
    it('rewrites :root[data-theme="light"] to @media + :root', () => {
      const out = rewrite(`:root[data-theme='light'] { --x: 1; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { :root { --x: 1; } }`))
    })

    it('rewrites html[data-theme="light"] to @media + html', () => {
      const out = rewrite(`html[data-theme='light'] { color-scheme: light; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { html { color-scheme: light; } }`))
    })

    it('rewrites bare [data-theme="light"] to @media + :root', () => {
      const out = rewrite(`[data-theme='light'] { --x: 1; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { :root { --x: 1; } }`))
    })

    it('strips [data-theme="light"] from descendant selector', () => {
      const out = rewrite(`[data-theme='light'] .foo { color: red; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { .foo { color: red; } }`))
    })

    it('rewrites dark predicate to @media (prefers-color-scheme: dark)', () => {
      const out = rewrite(`:root[data-theme='dark'] { --x: 1; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: dark) { :root { --x: 1; } }`))
    })
  })

  describe('comma-separated selector lists', () => {
    it('keeps multi-selector light block together', () => {
      const out = rewrite(`:root[data-theme='light'], [data-theme='light'] ::backdrop { --x: 1; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { :root, ::backdrop { --x: 1; } }`))
    })

    it('partitions a list with both light + dark themes', () => {
      const out = rewrite(`[data-theme='light'] .x, [data-theme='dark'] .y { color: red; }`)
      const normalized = norm(out)
      expect(normalized).toContain(norm(`@media (prefers-color-scheme: light) { .x { color: red; } }`))
      expect(normalized).toContain(norm(`@media (prefers-color-scheme: dark) { .y { color: red; } }`))
    })

    it('separates untheme selectors from themed ones', () => {
      const out = rewrite(`.a, :root[data-theme='light'] .b { color: red; }`)
      const normalized = norm(out)
      expect(normalized).toContain(norm(`.a { color: red; }`))
      expect(normalized).toContain(norm(`@media (prefers-color-scheme: light) { :root .b { color: red; } }`))
    })
  })

  describe('negation `:not([data-theme=…])` predicates', () => {
    it('inverts :not([data-theme="dark"]) to @media light', () => {
      const out = rewrite(`:root:not([data-theme='dark']) { --x: 1; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { :root { --x: 1; } }`))
    })

    it('inverts :not([data-theme="light"]) to @media dark', () => {
      const out = rewrite(`:root:not([data-theme='light']) { --x: 1; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: dark) { :root { --x: 1; } }`))
    })
  })

  describe('composite predicates within a single selector', () => {
    it('keeps consistent theme combo (light root + light-equivalent descendant)', () => {
      const out = rewrite(`:root[data-theme='light'] .x:not([data-theme='dark']) { --y: 1; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { :root .x { --y: 1; } }`))
    })

    it('drops contradictory theme combo (root=light + descendant=dark)', () => {
      const out = rewrite(`:root:not([data-theme='dark']) .expressive-code[data-theme='dark'] .ec { color: red; }`)
      // Contradiction: root requires light, block requires dark — never matches.
      // Result: rule is dropped.
      expect(norm(out)).toBe('')
    })

    it('keeps a per-element forced-light selector under @media light', () => {
      const out = rewrite(`.expressive-code[data-theme='light'] .ec { color: red; }`)
      expect(norm(out)).toBe(norm(`@media (prefers-color-scheme: light) { .expressive-code .ec { color: red; } }`))
    })
  })

  describe('untouched selectors', () => {
    it('passes through rules with no data-theme reference', () => {
      const css = `.foo { color: red; } .bar { color: blue; }`
      expect(norm(rewrite(css))).toBe(norm(css))
    })

    it('does not transform nested rules without data-theme', () => {
      const css = `@media (min-width: 50em) { :root { --x: 1; } }`
      expect(norm(rewrite(css))).toBe(norm(css))
    })

    it('transforms rules inside @media (min-width) blocks too', () => {
      const css = `@media (min-width: 50em) { :root[data-theme='light'] { --x: 1; } }`
      const out = norm(rewrite(css))
      // Either nested @media combination or hoisted — both are valid.
      // We just need the rule to no longer carry [data-theme='light'].
      expect(out).not.toContain(`data-theme`)
      expect(out).toContain(`prefers-color-scheme:light`)
      expect(out).toContain(`min-width:50em`)
    })
  })

  describe('Starlight 0.38 real-world snippets', () => {
    it('rewrites the props.css light token block', () => {
      const css = `:root[data-theme='light'],
        [data-theme='light'] ::backdrop {
            --sl-color-white: hsl(224, 10%, 10%);
            --sl-color-gray-1: hsl(224, 14%, 16%);
        }`
      const out = norm(rewrite(css))
      expect(out).toContain(`@media (prefers-color-scheme:light)`)
      expect(out).toContain(`:root,::backdrop`)
      expect(out).toContain(`--sl-color-white:hsl(224,10%,10%)`)
      expect(out).not.toContain(`data-theme`)
    })

    it('rewrites the reset.css color-scheme block', () => {
      const css = `html[data-theme='light'] { color-scheme: light; }`
      const out = norm(rewrite(css))
      expect(out).toBe(norm(`@media (prefers-color-scheme: light) { html { color-scheme: light; } }`))
    })

    it('rewrites the util.css hidden utility classes', () => {
      const css = `[data-theme='light'] .light\\:sl-hidden { display: none; }
                [data-theme='dark'] .dark\\:sl-hidden { display: none; }`
      const out = norm(rewrite(css))
      expect(out).toContain(`@media (prefers-color-scheme:light)`)
      expect(out).toContain(`@media (prefers-color-scheme:dark)`)
      expect(out).toContain(`.light\\:sl-hidden`)
      expect(out).toContain(`.dark\\:sl-hidden`)
      expect(out).not.toContain(`data-theme`)
    })
  })
})
