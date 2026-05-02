// Wraps a graph SVG in an HTML viewer with vanilla pan/zoom so macOS
// Preview / Quick Look's lack of interactive viewing isn't a blocker.
// Inlines the SVG to side-step file:// fetch CORS in browsers.
//
// Usage: tsx scripts/wrap-graph-viewer.ts <svg-filename>     # relative to graphs/
//        tsx scripts/wrap-graph-viewer.ts monorepo.svg

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const svgArg = process.argv[2]
if (!svgArg) {
  console.error('usage: tsx scripts/wrap-graph-viewer.ts <svg-filename>')
  process.exit(1)
}

const svgPath = join('graphs', svgArg)
const htmlPath = join('graphs', basename(svgArg, extname(svgArg)) + '.html')
const svg = readFileSync(svgPath, 'utf8')
// Strip XML prolog so it inlines cleanly into HTML.
const inline = svg.replace(/^<\?xml[^?]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/i, '')
const title = `Graph: ${basename(svgArg, extname(svgArg))}`

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #00021c; color: #f0edd8; font: 12px ui-monospace, monospace; }
    #stage { position: fixed; inset: 0; cursor: grab; }
    #stage.dragging { cursor: grabbing; }
    #stage > svg { display: block; width: 100vw; height: 100vh; user-select: none; -webkit-user-select: none; }
    #hud { position: fixed; top: 8px; left: 8px; padding: 6px 10px; background: rgba(28,40,77,0.9); border: 1px solid #732866; pointer-events: none; }
    #hud kbd { background: #1c284d; padding: 1px 5px; border: 1px solid #732866; }
    #zoom { position: fixed; bottom: 8px; right: 8px; padding: 4px 8px; background: rgba(28,40,77,0.9); border: 1px solid #732866; }
  </style>
</head>
<body>
  <div id="hud">drag = pan &nbsp;·&nbsp; wheel = zoom &nbsp;·&nbsp; <kbd>R</kbd> reset &nbsp;·&nbsp; <kbd>F</kbd> fit</div>
  <div id="stage">${inline}</div>
  <div id="zoom">100%</div>
  <script>
    const stage = document.getElementById('stage')
    const zoom = document.getElementById('zoom')
    const svg = stage.querySelector('svg')

    // Force the SVG to fill the viewport regardless of generator output.
    svg.removeAttribute('width')
    svg.removeAttribute('height')

    // Establish a viewBox if graphviz emitted absolute width/height only.
    if (!svg.hasAttribute('viewBox')) {
      const bb = svg.getBBox()
      svg.setAttribute('viewBox', \`\${bb.x} \${bb.y} \${bb.width} \${bb.height}\`)
    }
    const vb0 = (() => { const v = svg.viewBox.baseVal; return { x: v.x, y: v.y, w: v.width, h: v.height } })()
    const fitVB = () => apply(vb0.x, vb0.y, vb0.w, vb0.h)

    const apply = (x, y, w, h) => {
      svg.setAttribute('viewBox', \`\${x} \${y} \${w} \${h}\`)
      const ratio = vb0.w / w
      zoom.textContent = (ratio * 100).toFixed(0) + '%'
    }

    stage.addEventListener('wheel', (e) => {
      e.preventDefault()
      const v = svg.viewBox.baseVal
      const k = e.deltaY > 0 ? 1.15 : 1 / 1.15
      const rect = svg.getBoundingClientRect()
      const mx = v.x + (e.clientX - rect.left) * v.width / rect.width
      const my = v.y + (e.clientY - rect.top) * v.height / rect.height
      apply(mx - (mx - v.x) * k, my - (my - v.y) * k, v.width * k, v.height * k)
    }, { passive: false })

    let dragging = false, lx = 0, ly = 0
    stage.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; stage.classList.add('dragging') })
    window.addEventListener('mouseup',   () => { dragging = false; stage.classList.remove('dragging') })
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return
      const v = svg.viewBox.baseVal
      const rect = svg.getBoundingClientRect()
      const dx = (e.clientX - lx) * v.width  / rect.width
      const dy = (e.clientY - ly) * v.height / rect.height
      apply(v.x - dx, v.y - dy, v.width, v.height)
      lx = e.clientX; ly = e.clientY
    })

    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'f' || e.key === 'F') fitVB()
    })

    fitVB()
  </script>
</body>
</html>
`

writeFileSync(htmlPath, html)
console.log(`wrapped ${svgPath} -> ${htmlPath}`)
