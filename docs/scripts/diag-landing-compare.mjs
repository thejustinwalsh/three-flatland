import { webkit, chromium } from '@playwright/test'
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

async function test(browser, name, hideHero, scrollSweep) {
  const ctx = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})
  const page = await ctx.newPage()
  await page.goto('http://localhost:4321/three-flatland/',{waitUntil:'domcontentloaded'})
  if (hideHero) await page.addStyleTag({content:`.hero-canvas, .hero-canvas canvas { display: none !important; }`})
  await page.waitForTimeout(4000)  // generous warmup
  await page.evaluate(()=>{window.__perf={frames:[],lastTs:0,longTasks:0};const tick=ts=>{if(window.__perf.lastTs)window.__perf.frames.push(ts-window.__perf.lastTs);window.__perf.lastTs=ts;requestAnimationFrame(tick)};requestAnimationFrame(tick);try{const po=new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>50)window.__perf.longTasks++});po.observe({entryTypes:['longtask']})}catch{}})
  if (scrollSweep) {
    // Scroll the page slowly back and forth — exercises reveal animations + cards entering viewport
    const t0 = Date.now()
    while (Date.now() - t0 < 5000) {
      await page.mouse.wheel(0, 50)
      await page.waitForTimeout(50)
    }
  } else {
    await page.waitForTimeout(5000)
  }
  const r = await page.evaluate(()=>{const f=window.__perf.frames;const s=[...f].sort((a,b)=>a-b);return{frames:f.length,p50:s[Math.floor(s.length*0.5)]||0,p95:s[Math.floor(s.length*0.95)]||0,p99:s[Math.floor(s.length*0.99)]||0,longest:s[s.length-1]||0,jankPct:f.length?+(f.filter(x=>x>16.67).length/f.length*100).toFixed(1):0,stutterPct:f.length?+(f.filter(x=>x>33.3).length/f.length*100).toFixed(1):0,longTasks:window.__perf.longTasks}})
  console.log(`[${name.padEnd(38)}] frames=${String(r.frames).padStart(3)}/300 p50=${String(r.p50.toFixed(0)).padStart(3)}ms p95=${String(r.p95.toFixed(0)).padStart(3)}ms p99=${String(r.p99.toFixed(0)).padStart(3)}ms longest=${String(r.longest.toFixed(0)).padStart(3)}ms jank=${String(r.jankPct).padStart(5)}% stutter=${String(r.stutterPct).padStart(5)}% longTasks=${r.longTasks}`)
  await ctx.close()
}

try {
  console.log('=== LANDING PAGE — Chrome vs Webkit head-to-head ===\n')
  console.log('IDLE (no scroll, no cursor):')
  const ch = await chromium.launch()
  const wk = await webkit.launch()
  await test(ch, 'CHROME hero-on idle', false, false)
  await test(wk, 'WEBKIT hero-on idle', false, false)
  await test(ch, 'CHROME hero-off idle', true, false)
  await test(wk, 'WEBKIT hero-off idle', true, false)
  console.log('\nSCROLL SWEEP (continuous wheel):')
  await test(ch, 'CHROME hero-on scroll', false, true)
  await test(wk, 'WEBKIT hero-on scroll', false, true)
  await test(ch, 'CHROME hero-off scroll', true, true)
  await test(wk, 'WEBKIT hero-off scroll', true, true)
  await ch.close(); await wk.close()
} finally { await teardown() }
