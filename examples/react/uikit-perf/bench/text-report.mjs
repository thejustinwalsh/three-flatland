// Renders bench/text-results.json (+ text-shots/*.png) into a self-contained
// bench/text-report.html: GPU-cost-vs-DPI, per-frame JITTER-OVER-TIME charts (frame +
// GPU-ms time-series, Slug vs uikit), full stat tables, side-by-side size-ladder
// screenshots per DPR, and an off-axis shot. No recorded video (the live app is the
// shimmer test). Images embed as data-URIs. Run: `node bench/text-report.mjs`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, 'text-shots')
const data = JSON.parse(readFileSync(join(HERE, 'text-results.json'), 'utf8'))

const COLORS = { 'slug-webgpu': '#34d399', 'slug-webgl2': '#fbbf24', 'uikit-msdf': '#fb7185' }
const colorFor = (k) => COLORS[k] ?? '#94a3b8'
const uri = (f) => (f && existsSync(join(SHOTS, f)) ? 'data:image/png;base64,' + readFileSync(join(SHOTS, f)).toString('base64') : '')
const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m])
const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : 'n/a')

const ok = data.results.filter((r) => r.error == null)
const keys = [...new Set(ok.map((r) => r.key))]
const meta = (k) => ok.find((r) => r.key === k)
const frontal = (k, dpr) => ok.find((r) => r.key === k && r.dpr === dpr && r.rotate === 0)
const offaxis = (k) => ok.find((r) => r.key === k && r.rotate === data.offaxis)

function decimate(t, v, maxPts = 700) {
  const n = Math.min(t.length, v.length)
  if (n <= maxPts) return t.slice(0, n).map((x, i) => [x / 1000, v[i]])
  const bucket = Math.ceil(n / maxPts)
  const out = []
  for (let i = 0; i < n; i += bucket) {
    let st = 0, sv = 0, c = 0
    for (let j = i; j < Math.min(n, i + bucket); j++) { st += t[j]; sv += v[j]; c++ }
    out.push([st / c / 1000, sv / c])
  }
  return out
}

// Jitter-over-time chart payloads: per dpr, a frame series + a gpu series (line per cell).
const charts = []
for (const dpr of data.dprs) {
  const rows = keys.map((k) => frontal(k, dpr)).filter(Boolean)
  charts.push({
    dpr,
    frame: rows.map((r) => ({ key: r.key, color: colorFor(r.key), points: decimate(r.series.t, r.series.frame) })),
    gpu: rows
      .map((r) => ({ key: r.key, color: colorFor(r.key), points: decimate(r.series.t, r.series.gpu) }))
      .filter((s) => s.points.some(([, y]) => y > 0)),
  })
}

function statRow(r) {
  const fr = r.frameMs ?? {}, gp = r.gpuMs
  return `<tr><td><span class="dot" style="background:${colorFor(r.key)}"></span>${esc(r.cell)}</td>
    <td class="num">${r.draws ?? '—'}</td>
    <td class="num">${f2(fr.avg)}</td><td class="num">${f2(fr.p50)}</td><td class="num">${f2(fr.p95)}</td>
    <td class="num">${f2(fr.p99)}</td><td class="num strong">${f2(fr.jitter)}</td><td class="num">${f2(fr.stddev)}</td>
    <td class="num gpu">${gp ? f2(gp.avg) : 'n/a'}</td><td class="num gpu">${gp ? f2(gp.p95) : 'n/a'}</td></tr>`
}
function statTable(rows) {
  return `<div class="tw"><table><thead><tr><th>cell</th><th>draws</th>
    <th colspan="6" class="grp">frame time (ms)</th><th colspan="2" class="grp gpu">GPU (ms)</th></tr>
    <tr class="s2"><th></th><th></th><th>avg</th><th>p50</th><th>p95</th><th>p99</th><th>jitter</th><th>σ</th><th>avg</th><th>p95</th></tr></thead>
    <tbody>${rows.map(statRow).join('')}</tbody></table></div>`
}

// GPU-vs-DPI table.
function dpiTable() {
  const head = `<tr><th>cell</th>${data.dprs.map((d) => `<th class="num">GPU @dpr${d}</th>`).join('')}<th class="num">2/1</th><th class="num">off-axis ${data.offaxis}°</th></tr>`
  const body = keys.map((k) => {
    const g = (d) => frontal(k, d)?.gpuMs?.avg
    const ratio = g(1) && g(2) ? (g(2) / g(1)).toFixed(1) + '×' : '—'
    return `<tr><td><span class="dot" style="background:${colorFor(k)}"></span>${esc(meta(k).cell)}</td>
      ${data.dprs.map((d) => `<td class="num">${f2(g(d))}</td>`).join('')}
      <td class="num strong">${ratio}</td><td class="num">${f2(offaxis(k)?.gpuMs?.avg)}</td></tr>`
  }).join('')
  return `<div class="tw"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`
}

function ladderRow(dpr) {
  const cols = keys.filter((k) => data.shots[k]?.frontal[dpr]).map((k) =>
    `<figure><figcaption>${esc(meta(k).cell)}</figcaption><img loading="lazy" src="${uri(data.shots[k].frontal[dpr])}"></figure>`).join('')
  return `<h3>DPR ${dpr}${dpr === 2 ? ' (HiDPI)' : ''}</h3><div class="row c${keys.length}">${cols}</div>`
}
const offaxisRow = () => `<div class="row c${keys.length}">${keys.filter((k) => data.shots[k]?.offaxis).map((k) =>
  `<figure><figcaption>${esc(meta(k).cell)}</figcaption><img loading="lazy" src="${uri(data.shots[k].offaxis)}"></figure>`).join('')}</div>`

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Text benchmark — Slug vs uikit (text + icons)</title>
<style>
 :root{--bg:#0b0e13;--panel:#12161d;--line:#232a34;--fg:#e6edf3;--muted:#8b98a8}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,Menlo,monospace}
 .wrap{max-width:1400px;margin:0 auto;padding:28px 22px 80px}
 h1{font-size:21px;margin:0 0 4px} .meta{color:var(--muted);font-size:12.5px} .meta b{color:var(--fg)}
 h2{font-size:16px;margin:32px 0 6px;border-bottom:1px solid var(--line);padding-bottom:7px} h2 .sub{color:var(--muted);font-weight:400;font-size:13px}
 h3{font-size:13.5px;color:var(--muted);margin:16px 0 8px} p.lead{color:var(--muted);font-size:13px;max-width:82ch}
 .charts{display:grid;grid-template-columns:1fr 1fr;gap:14px} @media(max-width:900px){.charts{grid-template-columns:1fr}}
 figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:10px} figcaption{color:var(--muted);font-size:12px;margin-bottom:7px}
 canvas{width:100%;height:auto;display:block} img{width:100%;height:auto;display:block;border-radius:5px;background:#0b0e13}
 .row{display:grid;gap:12px} .row.c3{grid-template-columns:1fr 1fr 1fr} @media(max-width:1000px){.row.c3{grid-template-columns:1fr}}
 .tw{overflow-x:auto;border:1px solid var(--line);border-radius:9px;margin-top:6px} table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
 th,td{padding:7px 9px;text-align:left;white-space:nowrap} thead th{background:#161b23;color:var(--muted)} thead .grp{text-align:center;border-left:1px solid var(--line)} thead .grp.gpu,td.gpu{color:#a7b6ff}
 tr.s2 th{background:var(--panel)} tbody tr:nth-child(even){background:var(--panel)} td.num{text-align:right} td.num.strong{font-weight:700}
 .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:7px} .legend{display:flex;gap:16px;margin:10px 0;font-size:12.5px;color:var(--muted)} .legend span{display:inline-flex;align-items:center;gap:6px}
</style></head><body><div class="wrap">
<h1>Text benchmark — Slug vs uikit <span style="color:var(--muted);font-weight:400">(text + atom icons, no panels)</span></h1>
<div class="meta">Ran <b>${esc(data.ranAt)}</b> · identical uikit ladder, only the rendering backend differs · pangram + Lucide atom at 14 sizes 8→256px · <b>${(data.sampleMs/1000).toFixed(0)}s</b>/cell after warmup · real GPU. <b>uikit</b> = upstream @pmndrs/uikit (MSDF text + triangulated-mesh icons); <b>Slug</b> = analytic.</div>
<div class="legend">${keys.map((k) => `<span><span class="dot" style="background:${colorFor(k)}"></span>${esc(meta(k).cell)}</span>`).join('')}</div>

<h2>GPU cost vs DPI <span class="sub">— Slug is fill-bound, so HiDPI (4× the pixels) should hit it harder than MSDF</span></h2>
${dpiTable()}

<h2>Jitter over time <span class="sub">— per-frame, ${(data.sampleMs/1000).toFixed(0)}s window; flat = smooth, spikes = hitches</span></h2>
${data.dprs.map((dpr) => `<h3>DPR ${dpr}</h3><div class="charts">
  <figure><figcaption>frame time (ms)</figcaption><canvas id="fc_${dpr}" width="640" height="240"></canvas></figure>
  <figure><figcaption>GPU time (ms)</figcaption><canvas id="gc_${dpr}" width="640" height="240"></canvas></figure></div>
  ${statTable(keys.map((k) => frontal(k, dpr)).filter(Boolean))}`).join('')}

<h2>Same text, size ladder <span class="sub">— 8→256px, side by side</span></h2>
<p class="lead">Compare each size row across the two backends. Small sizes are where Slug's analytic edges vs MSDF's atlas sampling (and analytic vs mesh icons) diverge.</p>
${data.dprs.map(ladderRow).join('')}

<h2>Off-axis <span class="sub">— rotated ${data.offaxis}° (foreshortened). The live app's Wobble mode is the true shimmer test.</span></h2>
${offaxisRow()}
</div>
<script>
const CH = ${JSON.stringify(charts)};
const VSYNC = 16.67;
function niceMax(v, floor){ v=Math.max(v*1.15, floor||1); const s=v>40?20:v>16?10:v>4?2:1; return Math.ceil(v/s)*s }
function draw(id, series, floor){
  const cv=document.getElementById(id); if(!cv||!series||!series.length) return
  const dpr=window.devicePixelRatio||1, W=cv.width, H=cv.height; cv.width=W*dpr; cv.height=H*dpr
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr)
  const m={l:40,r:10,t:8,b:22}, pw=W-m.l-m.r, ph=H-m.t-m.b
  let xMax=0,yMax=0; for(const s of series) for(const [x,y] of s.points){ if(x>xMax)xMax=x; if(y>yMax)yMax=y }
  xMax=Math.max(xMax,1); yMax=niceMax(yMax, floor?VSYNC*1.4:1)
  const X=x=>m.l+(x/xMax)*pw, Y=y=>m.t+ph-(Math.min(y,yMax)/yMax)*ph
  ctx.font='10px ui-monospace,monospace'
  for(let i=0;i<=5;i++){ const yv=yMax*i/5,py=Y(yv); ctx.strokeStyle='#1b212b'; ctx.beginPath(); ctx.moveTo(m.l,py); ctx.lineTo(W-m.r,py); ctx.stroke(); ctx.fillStyle='#8b98a8'; ctx.textAlign='right'; ctx.fillText(yv.toFixed(0),m.l-6,py+3) }
  ctx.textAlign='center'; for(let i=0;i<=6;i++){ const xv=xMax*i/6; ctx.fillStyle='#8b98a8'; ctx.fillText(xv.toFixed(0)+'s',X(xv),H-7) }
  if(floor){ const py=Y(VSYNC); ctx.strokeStyle='#3a4658'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(m.l,py); ctx.lineTo(W-m.r,py); ctx.stroke(); ctx.setLineDash([]) }
  for(const s of series){ ctx.strokeStyle=s.color; ctx.lineWidth=1.2; ctx.globalAlpha=.92; ctx.beginPath(); s.points.forEach(([x,y],i)=>{ const px=X(x),py=Y(y); i?ctx.lineTo(px,py):ctx.moveTo(px,py) }); ctx.stroke(); ctx.globalAlpha=1 }
}
for(const c of CH){ draw('fc_'+c.dpr, c.frame, true); draw('gc_'+c.dpr, c.gpu, false) }
</script>
</body></html>`

writeFileSync(join(HERE, 'text-report.html'), html)
console.error(`wrote ${join(HERE, 'text-report.html')} (${(html.length/1e6).toFixed(1)} MB)`)
