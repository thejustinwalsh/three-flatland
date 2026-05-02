// Wraps a graph SVG in an HTML viewer with smooth pan/zoom.
// Uses CSS transform on a wrapper (GPU-accelerated, no SVG repaint) instead
// of mutating viewBox (which forced a full SVG relayout per event and was
// the source of the lag on large graphs).
//
// Usage: tsx scripts/wrap-graph-viewer.ts <svg-filename>     # relative to graphs/

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
const inline = svg.replace(/^<\?xml[^?]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/i, '')
const title = `Graph: ${basename(svgArg, extname(svgArg))}`

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #00021c; color: #f0edd8; font: 12px ui-monospace, monospace; }
    #stage { position: fixed; inset: 0; cursor: grab; overflow: hidden; touch-action: none; }
    #stage.dragging { cursor: grabbing; }
    /* Wrapper carries the transform; GPU-accelerated, no SVG relayout */
    #pan { position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform; }
    #pan > svg { display: block; pointer-events: none; }
    #hud, #zoom { position: fixed; padding: 6px 10px; background: rgba(28,40,77,0.9); border: 1px solid #732866; }
    #hud { top: 8px; left: 8px; pointer-events: none; }
    #hud kbd { background: #1c284d; padding: 1px 5px; border: 1px solid #732866; }
    #zoom { bottom: 8px; right: 8px; }
  </style>
</head>
<body>
  <div id="hud">drag = pan &nbsp;·&nbsp; wheel = zoom &nbsp;·&nbsp; <kbd>F</kbd> fit &nbsp;·&nbsp; <kbd>1</kbd> 100%</div>
  <div id="stage"><div id="pan">${inline}</div></div>
  <div id="zoom">100%</div>
  <script>
    const stage = document.getElementById('stage')
    const pan   = document.getElementById('pan')
    const zoom  = document.getElementById('zoom')
    const svg   = pan.querySelector('svg')

    // Force the SVG to its intrinsic size so the wrapper transform decides
    // what the viewport sees.
    const intrinsicW = parseFloat(svg.getAttribute('width')) || svg.viewBox.baseVal.width
    const intrinsicH = parseFloat(svg.getAttribute('height')) || svg.viewBox.baseVal.height
    svg.setAttribute('width',  intrinsicW)
    svg.setAttribute('height', intrinsicH)

    let scale = 1, tx = 0, ty = 0
    let dirty = false
    const flush = () => {
      pan.style.transform = \`translate(\${tx}px, \${ty}px) scale(\${scale})\`
      zoom.textContent = (scale * 100).toFixed(0) + '%'
      dirty = false
    }
    const schedule = () => { if (!dirty) { dirty = true; requestAnimationFrame(flush) } }

    const fit = () => {
      const sw = stage.clientWidth, sh = stage.clientHeight
      scale = Math.min(sw / intrinsicW, sh / intrinsicH) * 0.95
      tx = (sw - intrinsicW * scale) / 2
      ty = (sh - intrinsicH * scale) / 2
      schedule()
    }

    const reset = () => { scale = 1; tx = 0; ty = 0; schedule() }

    stage.addEventListener('wheel', (e) => {
      e.preventDefault()
      const k = e.deltaY > 0 ? 1 / 1.15 : 1.15
      const rect = stage.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      // Keep the cursor's world-point fixed under the pointer
      tx = px - (px - tx) * k
      ty = py - (py - ty) * k
      scale *= k
      schedule()
    }, { passive: false })

    let dragging = false, lx = 0, ly = 0, pid = -1
    stage.addEventListener('pointerdown', (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY; pid = e.pointerId
      stage.setPointerCapture(pid)
      stage.classList.add('dragging')
    })
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return
      tx += e.clientX - lx
      ty += e.clientY - ly
      lx = e.clientX; ly = e.clientY
      schedule()
    })
    const endDrag = () => {
      if (!dragging) return
      dragging = false
      if (pid >= 0) try { stage.releasePointerCapture(pid) } catch {}
      stage.classList.remove('dragging')
    }
    stage.addEventListener('pointerup', endDrag)
    stage.addEventListener('pointercancel', endDrag)

    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') fit()
      else if (e.key === '1') reset()
    })

    fit()
  </script>
</body>
</html>
`

writeFileSync(htmlPath, html)
console.log(`wrapped ${svgPath} -> ${htmlPath}`)
