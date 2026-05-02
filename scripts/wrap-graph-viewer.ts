// Generates a self-contained HTML viewer for a graph JSON, rendered with
// Cytoscape (canvas-based, virtualizes offscreen elements, infinite pan/zoom).
//
// Layout: cytoscape-dagre for the file-level views (compound parent nodes
// = workspace packages); cose for the overview view (no parents, free
// layout reads better for ~14 package nodes).
//
// Cytoscape, dagre, and cytoscape-dagre are copied to graphs/lib/ once and
// referenced relatively so each viewer file stays small.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const jsonArg = process.argv[2]
if (!jsonArg) {
  console.error('usage: tsx scripts/wrap-graph-viewer.ts <json-filename>')
  process.exit(1)
}

const jsonPath = join('graphs', jsonArg)
const stem = basename(jsonArg, extname(jsonArg))
const htmlPath = join('graphs', stem + '.html')
const isOverview = stem === 'overview'

const data = readFileSync(jsonPath, 'utf8')

// Mirror the cytoscape libs into graphs/lib/ so the viewer can load them
// over file:// without bundling them into every HTML.
mkdirSync('graphs/lib', { recursive: true })
const libs = [
  ['node_modules/cytoscape/dist/cytoscape.min.js', 'cytoscape.min.js'],
  ['node_modules/dagre/dist/dagre.min.js', 'dagre.min.js'],
  ['node_modules/cytoscape-dagre/cytoscape-dagre.js', 'cytoscape-dagre.js'],
] as const
for (const [src, dest] of libs) {
  const out = join('graphs/lib', dest)
  if (!existsSync(out)) copyFileSync(src, out)
}

const layout = isOverview
  ? `{ name: 'cose', animate: false, idealEdgeLength: 180, nodeRepulsion: 12000, padding: 40 }`
  : `{ name: 'dagre', rankDir: 'LR', nodeSep: 18, rankSep: 60, edgeSep: 8, animate: false }`

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Graph: ${stem}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #00021c; color: #f0edd8; font: 12px ui-monospace, monospace; }
    #cy { position: fixed; inset: 0; }
    #hud, #stats { position: fixed; padding: 6px 10px; background: rgba(28,40,77,0.92); border: 1px solid #732866; pointer-events: none; }
    #hud { top: 8px; left: 8px; }
    #hud kbd { background: #1c284d; padding: 1px 5px; border: 1px solid #732866; }
    #stats { bottom: 8px; right: 8px; }
    .legend-dot { display: inline-block; width: 8px; height: 8px; vertical-align: middle; margin-right: 4px; border-radius: 2px; }
  </style>
</head>
<body>
  <div id="cy"></div>
  <div id="hud">drag = pan &nbsp;·&nbsp; wheel = zoom &nbsp;·&nbsp; <kbd>F</kbd> fit &nbsp;·&nbsp; <kbd>1</kbd> 100%</div>
  <div id="stats"></div>
  <script src="lib/cytoscape.min.js"></script>
  <script src="lib/dagre.min.js"></script>
  <script src="lib/cytoscape-dagre.js"></script>
  <script>
    cytoscape.use(cytoscapeDagre)
    const data = ${data}

    // Color lookup so individual nodes can match their cluster (overview
    // has no compound parents, so per-node coloring is the only signal).
    const pkgColor = new Map(data.packages.map(p => [p.id, p.color]))
    const isOverview = ${isOverview}

    const elements = []
    if (!isOverview) {
      for (const p of data.packages) {
        elements.push({
          group: 'nodes',
          data: { id: '__pkg__' + p.id, label: p.label, color: p.color, isPkg: true }
        })
      }
    }
    for (const n of data.nodes) {
      const el = {
        group: 'nodes',
        data: {
          id: n.id,
          label: n.label,
          color: pkgColor.get(n.package) || '#47cca9',
          cyclic: !!n.cyclic,
        },
      }
      if (!isOverview && n.package) el.data.parent = '__pkg__' + n.package
      elements.push(el)
    }
    for (const e of data.edges) {
      elements.push({
        group: 'edges',
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          cross: !!e.cross,
          weight: e.weight ?? 1,
          label: e.weight ? String(e.weight) : '',
        },
      })
    }

    const cy = cytoscape({
      container: document.getElementById('cy'),
      elements,
      wheelSensitivity: 0.2,
      minZoom: 0.05,
      maxZoom: 4,
      // texture-on-viewport keeps panning crisp on large graphs by caching
      // a low-res snapshot during interaction
      textureOnViewport: true,
      hideEdgesOnViewport: ${!isOverview},
      hideLabelsOnViewport: ${!isOverview},
      pixelRatio: 1,
      style: [
        {
          selector: 'node[?isPkg]',
          style: {
            'background-color': '#0a0e24',
            'background-opacity': 0.55,
            'border-color': 'data(color)',
            'border-width': 2,
            'shape': 'round-rectangle',
            'label': 'data(label)',
            'color': 'data(color)',
            'font-family': 'ui-monospace, monospace',
            'font-size': 12,
            'text-valign': 'top',
            'text-halign': 'left',
            'text-margin-y': -4,
            'padding': '14px',
          },
        },
        {
          selector: 'node[!isPkg]',
          style: {
            'background-color': '#1c284d',
            'border-color': 'data(color)',
            'border-width': 1,
            'shape': 'round-rectangle',
            'label': 'data(label)',
            'color': '#f0edd8',
            'font-family': 'ui-monospace, monospace',
            'font-size': isOverview ? 14 : 9,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'none',
            'width': 'label',
            'height': 'label',
            'padding': isOverview ? '12px' : '4px',
          },
        },
        {
          selector: 'node[?cyclic]',
          style: { 'background-color': '#732866', 'border-color': '#d94c87' },
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'line-color': '#3a4a7a',
            'target-arrow-color': '#3a4a7a',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'width': 1,
            'opacity': 0.55,
          },
        },
        {
          selector: 'edge[?cross]',
          style: {
            'line-color': '#d94c87',
            'target-arrow-color': '#d94c87',
            'width': isOverview ? 'mapData(weight, 1, 30, 1, 6)' : 1.5,
            'opacity': 0.85,
            'label': isOverview ? 'data(label)' : '',
            'color': '#f0edd8',
            'font-family': 'ui-monospace, monospace',
            'font-size': 11,
            'text-background-color': '#00021c',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
          },
        },
        // Highlight on hover/select.
        {
          selector: 'node:selected, node.hover',
          style: { 'border-color': '#f7c93e', 'border-width': 3 },
        },
        {
          selector: 'edge.connected',
          style: { 'line-color': '#f7c93e', 'target-arrow-color': '#f7c93e', 'opacity': 1, 'width': 2 },
        },
      ],
      layout: ${layout},
    })

    // Click a node → highlight its incident edges and 1-hop neighborhood.
    cy.on('tap', 'node', (e) => {
      cy.elements().removeClass('connected hover')
      const n = e.target
      n.connectedEdges().addClass('connected')
      n.neighborhood('node').addClass('hover')
    })
    cy.on('tap', (e) => {
      if (e.target === cy) cy.elements().removeClass('connected hover')
    })

    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') cy.fit(undefined, 30)
      else if (e.key === '1') cy.zoom(1).center()
    })

    const m = data.meta
    document.getElementById('stats').innerHTML =
      \`\${m.fileCount} nodes &middot; \${m.edgeCount} edges\` +
      (m.crossCount ? \` &middot; \${m.crossCount} cross-package\` : '') +
      (m.cycleCount ? \` &middot; <span style="color:#d94c87">\${m.cycleCount} cycle\${m.cycleCount === 1 ? '' : 's'}</span>\` : '')
  </script>
</body>
</html>
`

writeFileSync(htmlPath, html)
console.log(`wrapped ${jsonPath} -> ${htmlPath}`)
