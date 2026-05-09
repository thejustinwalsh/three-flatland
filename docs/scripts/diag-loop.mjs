import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
let server = null
async function probe() { try { return (await fetch('http://localhost:4321/three-flatland/', { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }
async function ensureServer() {
  if (await probe()) return
  server = spawn('pnpm',['--filter=docs','dev'],{cwd:resolve(import.meta.dirname,'..'),stdio:['ignore','pipe','pipe'],env:{...process.env,TURBO_MFE_PORT:'4321'}})
  server.stdout.on('data',()=>{});server.stderr.on('data',()=>{})
  const dl=Date.now()+60000;while(Date.now()<dl){await new Promise(r=>setTimeout(r,500));if(await probe())return};process.exit(1)
}
async function teardown() { if(server){server.kill('SIGTERM');await new Promise(r=>setTimeout(r,800))} }
process.on('SIGINT',()=>teardown().finally(()=>process.exit(130)))
await ensureServer()
const browser = await webkit.launch()

async function test(name, payload) {
  const ctx = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'no-preference'})
  const page = await ctx.newPage()
  await page.goto('http://localhost:4321/three-flatland/',{waitUntil:'domcontentloaded'})
  await page.addStyleTag({content:`.hero-canvas, .hero-canvas canvas { display: none !important; }`})
  await page.waitForTimeout(4000)
  await payload(page)
  await page.evaluate(()=>{window.__perf={frames:[],lastTs:0};const tick=ts=>{if(window.__perf.lastTs)window.__perf.frames.push(ts-window.__perf.lastTs);window.__perf.lastTs=ts;requestAnimationFrame(tick)};requestAnimationFrame(tick)})
  await page.waitForTimeout(5000)
  const r = await page.evaluate(()=>{const f=window.__perf.frames;const s=[...f].sort((a,b)=>a-b);return{frames:f.length,p50:s[Math.floor(s.length*0.5)]||0,p95:s[Math.floor(s.length*0.95)]||0,stutterPct:f.length?+(f.filter(x=>x>33.3).length/f.length*100).toFixed(1):0}})
  console.log(`[${name.padEnd(50)}] frames=${String(r.frames).padStart(3)}/300 p50=${String(r.p50.toFixed(0)).padStart(3)}ms p95=${String(r.p95.toFixed(0)).padStart(3)}ms stutter=${r.stutterPct}%`)
  await ctx.close()
}

try {
  console.log('Landing (HeroShader hidden) — isolating what causes the idle stall:\n')

  await test('A. baseline (motion loop running)', async () => {})

  await test('B. counted-targets (how many active?)', async (page) => {
    const counts = await page.evaluate(() => {
      const els = document.querySelectorAll('.u-light, .u-holo, [data-light], [data-holo], .sl-link-button.primary, .sl-link-button.secondary')
      return { total: els.length, visible: [...els].filter(e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight }).length }
    })
    console.log(`  >> motion targets total=${counts.total} visible-in-viewport=${counts.visible}`)
  })

  await test('C. scene-angle write disabled', async (page) => {
    await page.evaluate(() => {
      const orig = document.documentElement.style.setProperty.bind(document.documentElement.style)
      document.documentElement.style.setProperty = (n,v,p) => { if (n === '--scene-angle') return; return orig(n,v,p) }
      const els = document.querySelectorAll('.u-light, [data-light], .feature-card, .gallery-tile, .value-prop, .stat-item, .feature-item, .pag-link, .sl-link-button.primary, .sl-link-button.secondary')
      for (const el of els) { const o = el.style.setProperty.bind(el.style); el.style.setProperty = (n,v,p) => { if (n === '--scene-angle') return; return o(n,v,p) } }
    })
  })

  await test('D. ALL motion writes disabled', async (page) => {
    await page.evaluate(() => {
      const els = document.querySelectorAll('*')
      for (const el of els) { try { el.style.setProperty = () => {} } catch {} }
      document.documentElement.style.setProperty = () => {}
    })
  })

  await test('E. animations paused (animation-play-state)', async (page) => {
    await page.addStyleTag({content:`*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }`})
  })

  await test('F. reveal animation finished + paused', async (page) => {
    await page.evaluate(() => {
      // Force all reveals to "revealed" state so the IntersectionObserver-based reveal loop has nothing to do
      document.querySelectorAll('.u-reveal, [data-reveal]').forEach(el => el.dataset.revealed = '')
    })
    await page.addStyleTag({content:`*, *::before, *::after { animation-play-state: paused !important; }`})
  })
} finally { await browser.close(); await teardown() }
