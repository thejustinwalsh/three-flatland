/**
 * remark plugin — strip trailing `/index/` segments from typedoc-generated
 * markdown link URLs.
 *
 * Why this exists:
 *   With `entryFileName: 'index'`, typedoc-plugin-markdown emits an
 *   `index.md` at each module directory root (good — Astro routes those
 *   to the directory's URL). But the plugin's internal URL builder
 *   includes the file's basename in generated links, so a link to the
 *   module root comes out as `/api/foo/src/index/` instead of `/api/foo/src/`.
 *   Astro serves the directory root from `index.html`, so `/index/`
 *   resolves to `/api/foo/src/index/index.html` which does not exist.
 *
 * What this plugin does:
 *   For every `[text](url)` and `<a href="url">` node in the markdown
 *   AST, strip a trailing `/index` (with or without trailing slash) so
 *   the link points at the directory root Astro actually serves.
 *
 *   `/api/foo/src/index/`           → `/api/foo/src/`
 *   `/api/foo/src/index`            → `/api/foo/src/`
 *   `/api/foo/src/index/#anchor`    → `/api/foo/src/#anchor`
 *
 *   External URLs and anchors-only links are left alone.
 *
 * Scope:
 *   Registered globally via Astro's `markdown.remarkPlugins`, but the
 *   only place this transformation matters is the typedoc-generated
 *   content under `/api/`. It's idempotent and a no-op on other pages.
 */
import { visit } from 'unist-util-visit'

function stripIndex(url) {
    if (typeof url !== 'string' || url.length === 0) return url
    // Skip protocol-prefixed and pure-anchor URLs.
    if (/^[a-z]+:/i.test(url) || url.startsWith('#')) return url
    return url
        .replace(/\/index\/(\?|#|$)/, '/$1')
        .replace(/\/index(\?|#|$)/, '/$1')
}

export default function remarkStripIndexLinks() {
    return (tree) => {
        visit(tree, 'link', (node) => {
            if (typeof node.url === 'string') {
                node.url = stripIndex(node.url)
            }
        })
        // Also handle <a href="..."> nodes (raw HTML in markdown).
        visit(tree, 'html', (node) => {
            if (typeof node.value === 'string' && /href=/i.test(node.value)) {
                node.value = node.value.replace(/href="([^"]+)"/gi, (_, url) => `href="${stripIndex(url)}"`)
            }
        })
    }
}
