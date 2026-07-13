// Renders bench/results.json into a self-contained bench/report.html. Headline is the
// LOAD-SCALING curve: GPU-ms and frame-ms vs card count for Slug (fork) vs MSDF
// (upstream), per mode — so you can see where MSDF's flat atlas-sample cost pulls ahead
// of Slug's analytic per-fragment cost, and that at realistic loads the gap is tiny.
// Also: a GPU-cost-vs-load table, jitter time-series at a realistic focus load, full
// stat tables, and links to the CDP DevTools traces. No external deps (inline canvas).
// Run standalone: `node bench/report.mjs`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(HERE, 'results.json'), 'utf8'))

const COLORS = {
  'lab · fork · WebGPU · Slug': '#34d399',
  'lab · fork · WebGL2 · Slug': '#fbbf24',
  'lab · upstream · WebGL2 · MSDF': '#fb7185',
  'bento · fork · WebGPU · Slug': '#22d3ee',
  'bento · fork · WebGL2 · Slug': '#c084fc',
}
const colorFor = (cell) => COLORS[cell] ?? '#94a3b8'
const short = (cell) => cell.replace('lab · ', '').replace('fork · ', '').replace('upstream · ', '')

const MODE_LABEL = {
  cards: 'Cards — layout + glyphs',
  decorated: 'Decorated — + panels, borders, depth',
  sampled: 'Sampled — + per-card live color signal',
}

const ok = data.results.filter((r) => r.error == null)
const errors = data.results.filter((r) => r.error != null)
const lab = ok.filter((r) => r.kind === 'lab')
const bento = ok.filter((r) => r.kind === 'bento')

const modes = data.sweep.modes
const levelsPresent = [...new Set(lab.map((r) => r.level))].sort((a, b) => a - b)
const itemsForLevel = {}
for (const r of lab) itemsForLevel[r.level] = r.items
// Realistic focus load for the jitter time-series: the level closest to 768 cards.
const focusLevel = levelsPresent.reduce(
  (best, l) => (Math.abs((itemsForLevel[l] ?? 0) - 768) < Math.abs((itemsForLevel[best] ?? 0) - 768) ? l : best),
  levelsPresent[0]
)

const cells = [...new Set(lab.map((r) => r.cell))]
const rowAt = (cell, mode, level) => lab.find((r) => r.cell === cell && r.mode === mode && r.level === level)

// Scaling series per mode: x = card count, y = GPU avg / frame avg, one line per cell.
function scalingSeries(mode, metric) {
  return cells
    .map((cell) => ({
      label: cell,
      color: colorFor(cell),
      points: levelsPresent
        .map((l) => {
          const r = rowAt(cell, mode, l)
          const y = metric === 'gpu' ? r?.gpuMs?.avg : r?.frameMs?.avg
          return r && typeof y === 'number' ? [r.items, y] : null
        })
        .filter(Boolean),
    }))
    .filter((s) => s.points.length > 0)
}

// Decimate a per-frame series to ~maxPts points for a smooth canvas draw.
function decimate(t, v, maxPts = 700) {
  const n = Math.min(t.length, v.length)
  if (n <= maxPts) return t.slice(0, n).map((x, i) => [x / 1000, v[i]])
  const bucket = Math.ceil(n / maxPts)
  const out = []
  for (let i = 0; i < n; i += bucket) {
    let st = 0
    let sv = 0
    let c = 0
    for (let j = i; j < Math.min(n, i + bucket); j++) {
      st += t[j]
      sv += v[j]
      c++
    }
    out.push([st / c / 1000, sv / c])
  }
  return out
}

const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m])
const f2 = (x) => (typeof x === 'number' ? x.toFixed(2) : 'n/a')
const pctDiff = (a, b) => ((a - b) / b) * 100

// GPU-cost-vs-load table for a representative mode: MSDF vs Slug + ratio per card count.
function gpuVsLoadTable(mode) {
  const msdfCell = cells.find((c) => c.includes('MSDF'))
  const slugCells = cells.filter((c) => c.includes('Slug'))
  const head = `<tr><th>cards</th><th class="msdf">MSDF GPU</th>${slugCells
    .map((c) => `<th class="slug">${esc(short(c))}</th>`)
    .join('')}<th>Slug/MSDF</th></tr>`
  const body = levelsPresent
    .map((l) => {
      const m = rowAt(msdfCell, mode, l)?.gpuMs?.avg
      const slugVals = slugCells.map((c) => rowAt(c, mode, l)?.gpuMs?.avg)
      const bestSlug = slugVals.filter((x) => typeof x === 'number').sort((a, b) => a - b)[0]
      const ratio = typeof m === 'number' && typeof bestSlug === 'number' && m > 0 ? (bestSlug / m).toFixed(1) : '—'
      return `<tr><td class="num">${(itemsForLevel[l] ?? 0).toLocaleString()}</td>
        <td class="num msdf">${f2(m)}</td>${slugVals.map((v) => `<td class="num slug">${f2(v)}</td>`).join('')}
        <td class="num strong">${ratio}×</td></tr>`
    })
    .join('')
  return `<div class="tablewrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`
}

function statRow(r) {
  const fr = r.frameMs ?? {}
  const gp = r.gpuMs
  return `<tr>
    <td><span class="dot" style="background:${colorFor(r.cell)}"></span>${esc(short(r.cell))}</td>
    <td class="tech ${r.tech === 'MSDF' ? 'msdf' : 'slug'}">${esc(r.tech)}</td>
    <td class="num">${r.drawCalls ?? '—'}</td>
    <td class="num">${f2(fr.avg)}</td><td class="num">${f2(fr.p50)}</td><td class="num">${f2(fr.p95)}</td>
    <td class="num">${f2(fr.p99)}</td><td class="num">${f2(fr.max)}</td><td class="num strong">${f2(fr.jitter)}</td><td class="num">${f2(fr.stddev)}</td>
    <td class="num gpu">${gp ? f2(gp.avg) : 'n/a'}</td><td class="num gpu">${gp ? f2(gp.p95) : 'n/a'}</td><td class="num gpu">${gp ? f2(gp.p99) : 'n/a'}</td>
  </tr>`
}

function statTable(rows) {
  return `<div class="tablewrap"><table>
    <thead><tr>
      <th>cell</th><th>text</th><th>draws</th>
      <th colspan="7" class="grp">frame time (ms)</th><th colspan="3" class="grp gpu">GPU (ms)</th>
    </tr><tr class="sub2">
      <th></th><th></th><th></th>
      <th>avg</th><th>p50</th><th>p95</th><th>p99</th><th>max</th><th>jitter</th><th>σ</th><th>avg</th><th>p95</th><th>p99</th>
    </tr></thead><tbody>${rows.map(statRow).join('')}</tbody></table></div>`
}

// Chart payloads for the client script.
const scaling = modes.map((mode) => ({
  mode,
  label: MODE_LABEL[mode] ?? mode,
  gpu: scalingSeries(mode, 'gpu'),
  frame: scalingSeries(mode, 'frame'),
}))
const timeseries = modes.map((mode) => {
  const rows = lab.filter((r) => r.mode === mode && r.level === focusLevel)
  return {
    mode,
    label: MODE_LABEL[mode] ?? mode,
    frame: rows.map((r) => ({ label: r.cell, color: colorFor(r.cell), points: decimate(r.series.t, r.series.frame) })),
    gpu: rows
      .map((r) => ({ label: r.cell, color: colorFor(r.cell), points: decimate(r.series.t, r.series.gpu) }))
      .filter((s) => s.points.some(([, y]) => y > 0)),
  }
})

const traceLinks = (data.traces ?? [])
  .map(
    (t) =>
      `<li><span class="dot" style="background:${colorFor(t.cell)}"></span><code>${esc(t.file)}</code> — ${esc(
        short(t.cell)
      )} @ ${esc(t.mode)}/L${t.level} <span class="muted">(${t.events.toLocaleString()} events)</span></li>`
  )
  .join('')

const shotsList = data.shots ?? []
const shotsSection = shotsList.length
  ? `<h2>Font quality — Slug vs MSDF <span class="sub">same heading, same size, cropped from the live scene</span></h2>
<p class="lead">Slug renders glyphs from analytic Bézier outlines — crisp at any size, no atlas. MSDF samples a baked
signed-distance atlas — one texture read, softer edges, and it degrades once you scale past the atlas resolution. Compare
edge sharpness on diagonal and curved strokes. This is Slug's side of the trade: it costs more GPU (below), but stays
razor-sharp and resolution-independent — bake once, render at any size.</p>
<div class="shots">${shotsList
      .map(
        (s) =>
          `<figure><figcaption><span class="dot" style="background:${colorFor(s.cell)}"></span>${esc(
            short(s.cell)
          )} <span class="tech ${s.tech === 'MSDF' ? 'msdf' : 'slug'}">${esc(s.tech)}</span></figcaption>
        <img src="${s.heading}" alt="${esc(s.cell)} text"><div class="note"><a href="${esc(s.full)}">full frame →</a></div></figure>`
      )
      .join('')}</div>`
  : ''

const sweep = data.sweep
const focusItems = (itemsForLevel[focusLevel] ?? 0).toLocaleString()
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>uikit render benchmark — Slug vs MSDF</title>
<style>
  :root{--bg:#0b0e13;--panel:#12161d;--panel2:#161b23;--line:#232a34;--fg:#e6edf3;--muted:#8b98a8;
    --slug:#34d399;--msdf:#fb7185;--good:#34d399;--bad:#fb7185;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,'SF Mono',Menlo,monospace;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1180px;margin:0 auto;padding:32px 24px 80px}
  header h1{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
  header .meta{color:var(--muted);font-size:12.5px}
  header .meta b{color:var(--fg)}
  .legend{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0 4px;font-size:12.5px}
  .legend span{display:inline-flex;align-items:center;gap:6px;color:var(--muted)}
  .dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}
  h2{font-size:16px;margin:34px 0 6px;padding-bottom:8px;border-bottom:1px solid var(--line)}
  h2 .sub{color:var(--muted);font-weight:400;font-size:13px}
  h3{font-size:14px;margin:22px 0 8px;color:var(--fg)}
  p.lead{color:var(--muted);font-size:13px;margin:6px 0 16px;max-width:78ch}
  .charts{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:8px}
  @media(max-width:900px){.charts{grid-template-columns:1fr}}
  .charts.two{grid-template-columns:1fr 1fr}
  @media(max-width:900px){.charts.two{grid-template-columns:1fr}}
  figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}
  figcaption{color:var(--muted);font-size:12px;margin-bottom:8px}
  figcaption b{color:var(--fg)}
  canvas{width:100%;height:auto;display:block}
  .shots{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:6px 0}
  @media(max-width:900px){.shots{grid-template-columns:1fr}}
  .shots img{width:100%;border-radius:6px;border:1px solid var(--line);background:#0d1117;display:block}
  .shots figcaption{display:flex;align-items:center;gap:6px;margin-bottom:8px}
  .shots a{color:#7dd3fc;text-decoration:none} .shots .note{margin-top:6px}
  .tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;margin-top:6px}
  table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
  th,td{padding:7px 9px;text-align:left;white-space:nowrap}
  thead th{background:var(--panel2);color:var(--muted);font-weight:600;border-bottom:1px solid var(--line)}
  thead .grp{text-align:center;border-left:1px solid var(--line)}
  thead .grp.gpu,td.gpu{color:#a7b6ff}
  th.msdf,td.msdf{color:var(--msdf)} th.slug,td.slug{color:var(--slug)}
  tr.sub2 th{font-weight:500;background:var(--panel)}
  tbody tr:nth-child(even){background:var(--panel)}
  td.num{text-align:right} td.num.strong{color:var(--fg);font-weight:600}
  td .dot{margin-right:7px}
  .tech{font-size:11px} .tech.slug{color:var(--slug)}.tech.msdf{color:var(--msdf)}
  .traces{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin-top:18px}
  .traces ul{margin:8px 0 0;padding-left:0;list-style:none;font-size:12.5px}
  .traces li{margin:6px 0;color:var(--muted)}
  .traces code{color:var(--fg);background:var(--panel2);padding:1px 6px;border-radius:5px}
  .muted{color:var(--muted)} .note{color:var(--muted);font-size:12px;margin-top:10px}
</style></head><body><div class="wrap">
<header>
  <h1>uikit render benchmark — Slug vs MSDF</h1>
  <div class="meta">Ran <b>${esc(data.ranAt)}</b> · real GPU, non-headless · sample <b>${(sweep.sampleMs / 1000).toFixed(
    0
  )}s</b>/point · loads <b>[${levelsPresent.map((l) => (itemsForLevel[l] ?? 0)).join(', ')}]</b> cards ·
    modes <b>[${modes.join(', ')}]</b>. GPU-ms measured through the same <b>EXT_disjoint_timer_query</b> for Slug &amp; MSDF
    (fork WebGPU uses TimestampQuery).</div>
</header>
<div class="legend">${cells
  .concat(bento.map((b) => b.cell))
  .filter((c, i, a) => a.indexOf(c) === i)
  .map((c) => `<span><span class="dot" style="background:${colorFor(c)}"></span>${esc(short(c))}</span>`)
  .join('')}</div>

${shotsSection}

<h2>GPU cost vs load <span class="sub">— where does MSDF pull ahead of Slug?</span></h2>
<p class="lead">Slug evaluates Bézier coverage per fragment (ALU); MSDF samples a baked atlas (one texture read). Watch the
green/gold Slug lines climb away from the salmon MSDF line as glyph count rises. At realistic loads (~200–1500 cards) all
lines sit near the floor — the gap only bites at synthetic stress loads.</p>
<div class="charts">
  ${scaling
    .map(
      (s) =>
        `<figure><figcaption><b>${esc(s.label.split(' — ')[0])}</b> — GPU avg (ms) vs cards</figcaption>
      <canvas id="sg_${s.mode}" width="360" height="260"></canvas></figure>`
    )
    .join('')}
</div>

<h3>GPU cost per load — MSDF vs Slug (decorated mode)</h3>
${gpuVsLoadTable(modes.includes('decorated') ? 'decorated' : modes[0])}

<h2>Frame time vs load</h2>
<div class="charts">
  ${scaling
    .map(
      (s) =>
        `<figure><figcaption><b>${esc(s.label.split(' — ')[0])}</b> — frame avg (ms) vs cards</figcaption>
      <canvas id="sf_${s.mode}" width="360" height="260"></canvas></figure>`
    )
    .join('')}
</div>

<h2>Jitter — frame &amp; GPU over time <span class="sub">@ ${focusItems} cards (realistic load)</span></h2>
<p class="lead">Per-frame samples over the ${(sweep.sampleMs / 1000).toFixed(0)}s window after warmup. Flat = smooth;
spikes = hitches. Dashed line marks the 60fps (16.67ms) budget.</p>
${modes
  .map(
    (m) => `<h3>${esc(MODE_LABEL[m] ?? m)}</h3>
  <div class="charts two">
    <figure><figcaption>Frame time (ms)</figcaption><canvas id="tf_${m}" width="540" height="260"></canvas></figure>
    <figure><figcaption>GPU time (ms)</figcaption><canvas id="tg_${m}" width="540" height="260"></canvas></figure>
  </div>
  ${statTable(lab.filter((r) => r.mode === m && r.level === focusLevel))}`
  )
  .join('')}

<h2>Bento showcase <span class="sub">— fixed product scene</span></h2>
${statTable(bento)}

<h2>Full stats — all loads</h2>
${modes
  .map(
    (m) =>
      `<h3>${esc(MODE_LABEL[m] ?? m)}</h3>${levelsPresent
        .map(
          (l) =>
            `<div class="muted" style="font-size:12px;margin:8px 0 2px">${(itemsForLevel[l] ?? 0).toLocaleString()} cards</div>${statTable(
              lab.filter((r) => r.mode === m && r.level === l)
            )}`
        )
        .join('')}`
  )
  .join('')}

<div class="traces">
  <b>Chrome DevTools traces</b> — DevTools <b>Performance</b> panel → <b>Load profile…</b> (or <code>chrome://tracing</code>)
  → pick a file to inspect the GPU track, raster, and main-thread work at the focus workload.
  <ul>${traceLinks || '<li class="muted">none captured</li>'}</ul>
  <div class="note">Files under <code>examples/react/uikit-perf/bench/</code>. Compare a Slug trace vs the MSDF trace to see what the GPU is doing differently.</div>
</div>
${errors.length ? `<div class="traces"><b>Cells that failed</b><ul>${errors
    .map((e) => `<li>${esc(e.cell)} — ${esc(e.error)}</li>`)
    .join('')}</ul></div>` : ''}
</div>
<script>
const SCALING = ${JSON.stringify(scaling)};
const TS = ${JSON.stringify(timeseries)};
const VSYNC = 16.67;
function niceMax(v, floor){ v=Math.max(v*1.15, floor||1); const step=v>40?20:v>16?10:v>4?2:1; return Math.ceil(v/step)*step; }
// Time-series line chart (x = seconds).
function drawTS(id, series, floor){
  const cv=document.getElementById(id); if(!cv||!series||!series.length) return;
  const dpr=window.devicePixelRatio||1, W=cv.width, H=cv.height; cv.width=W*dpr; cv.height=H*dpr;
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
  const m={l:42,r:10,t:8,b:24}, pw=W-m.l-m.r, ph=H-m.t-m.b;
  let xMax=0,yMax=0; for(const s of series) for(const [x,y] of s.points){ if(x>xMax)xMax=x; if(y>yMax)yMax=y; }
  xMax=Math.max(xMax,1); yMax=niceMax(yMax,floor?VSYNC*1.4:1);
  const X=x=>m.l+(x/xMax)*pw, Y=y=>m.t+ph-(Math.min(y,yMax)/yMax)*ph;
  ctx.font='10px ui-monospace,monospace';
  for(let i=0;i<=5;i++){ const yv=yMax*i/5, py=Y(yv); ctx.strokeStyle='#1b212b'; ctx.beginPath(); ctx.moveTo(m.l,py); ctx.lineTo(W-m.r,py); ctx.stroke();
    ctx.fillStyle='#8b98a8'; ctx.textAlign='right'; ctx.fillText(yv.toFixed(0),m.l-6,py+3); }
  ctx.textAlign='center'; for(let i=0;i<=6;i++){ const xv=xMax*i/6; ctx.fillStyle='#8b98a8'; ctx.fillText(xv.toFixed(0)+'s',X(xv),H-8); }
  if(floor){ const py=Y(VSYNC); ctx.strokeStyle='#3a4658'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(m.l,py); ctx.lineTo(W-m.r,py); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#5a6678'; ctx.textAlign='left'; ctx.fillText('60fps',m.l+4,py-3); }
  for(const s of series){ ctx.strokeStyle=s.color; ctx.lineWidth=1.3; ctx.globalAlpha=.92; ctx.beginPath();
    s.points.forEach(([x,y],i)=>{ const px=X(x),py=Y(y); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.stroke(); ctx.globalAlpha=1; }
}
// Scaling line chart (x = card count, log scale).
function drawScale(id, series){
  const cv=document.getElementById(id); if(!cv||!series||!series.length) return;
  const dpr=window.devicePixelRatio||1, W=cv.width, H=cv.height; cv.width=W*dpr; cv.height=H*dpr;
  const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
  const m={l:38,r:10,t:8,b:26}, pw=W-m.l-m.r, ph=H-m.t-m.b;
  let xs=new Set(), yMax=0; for(const s of series) for(const [x,y] of s.points){ xs.add(x); if(y>yMax)yMax=y; }
  xs=[...xs].sort((a,b)=>a-b); const lx=v=>Math.log10(v);
  const xMin=lx(xs[0]), xMax=lx(xs[xs.length-1])||xMin+1; yMax=niceMax(yMax,1);
  const X=v=>m.l+((lx(v)-xMin)/((xMax-xMin)||1))*pw, Y=y=>m.t+ph-(Math.min(y,yMax)/yMax)*ph;
  ctx.font='10px ui-monospace,monospace';
  for(let i=0;i<=5;i++){ const yv=yMax*i/5, py=Y(yv); ctx.strokeStyle='#1b212b'; ctx.beginPath(); ctx.moveTo(m.l,py); ctx.lineTo(W-m.r,py); ctx.stroke();
    ctx.fillStyle='#8b98a8'; ctx.textAlign='right'; ctx.fillText(yv.toFixed(0),m.l-6,py+3); }
  ctx.textAlign='center'; for(const x of xs){ ctx.fillStyle='#8b98a8'; const lbl=x>=1000?(x/1000).toFixed(x%1000?1:0)+'k':x; ctx.fillText(lbl,X(x),H-9); }
  for(const s of series){ ctx.strokeStyle=s.color; ctx.lineWidth=1.6; ctx.beginPath();
    s.points.forEach(([x,y],i)=>{ const px=X(x),py=Y(y); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.stroke();
    ctx.fillStyle=s.color; for(const [x,y] of s.points){ ctx.beginPath(); ctx.arc(X(x),Y(y),2.4,0,7); ctx.fill(); } }
}
for(const s of SCALING){ drawScale('sg_'+s.mode, s.gpu); drawScale('sf_'+s.mode, s.frame); }
for(const t of TS){ drawTS('tf_'+t.mode, t.frame, true); drawTS('tg_'+t.mode, t.gpu, false); }
</script>
</body></html>`

const outPath = join(HERE, 'report.html')
writeFileSync(outPath, html)
console.error(`wrote ${outPath} (${modes.length} modes, ${levelsPresent.length} loads, ${data.traces?.length ?? 0} traces)`)
