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

async function once() {
  const ctx = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})
  const page = await ctx.newPage()
  await page.goto('http://localhost:4321/three-flatland/',{waitUntil:'domcontentloaded'})
  await page.addStyleTag({content:`.hero-canvas, .hero-canvas canvas { display: none !important; }`})
  await page.waitForTimeout(4000)
  await page.evaluate(()=>{window.__perf={frames:[],lastTs:0};const tick=ts=>{if(window.__perf.lastTs)window.__perf.frames.push(ts-window.__perf.lastTs);window.__perf.lastTs=ts;requestAnimationFrame(tick)};requestAnimationFrame(tick)})
  await page.waitForTimeout(5000)
  const r = await page.evaluate(()=>{const f=window.__perf.frames;const s=[...f].sort((a,b)=>a-b);return{frames:f.length,p50:s[Math.floor(s.length*0.5)]||0,p95:s[Math.floor(s.length*0.95)]||0,stutterPct:f.length?+(f.filter(x=>x>33.3).length/f.length*100).toFixed(1):0}})
  await ctx.close()
  return r
}

try {
  console.log('Webkit landing (HeroShader hidden), 5 identical runs:\n')
  for (let i=1; i<=5; i++) {
    const r = await once()
    console.log(`  run ${i}: frames=${String(r.frames).padStart(3)}/300 p50=${String(r.p50.toFixed(0)).padStart(3)}ms p95=${String(r.p95.toFixed(0)).padStart(3)}ms stutter=${r.stutterPct}%`)
  }
} finally { await browser.close(); await teardown() }
