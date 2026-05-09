import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
let server = null
async function probe(p='/three-flatland/') { try { return (await fetch('http://localhost:4321'+p, { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }
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
async function pageTest(url, label) {
  const ctx = await browser.newContext({ viewport:{width:1440,height:900}, deviceScaleFactor:2 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:4321'+url,{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(3000)  // longer settle for reveal-on-scroll
  await page.evaluate(()=>{window.__perf={frames:[],lastTs:0};const tick=ts=>{if(window.__perf.lastTs)window.__perf.frames.push(ts-window.__perf.lastTs);window.__perf.lastTs=ts;requestAnimationFrame(tick)};requestAnimationFrame(tick)})
  await page.waitForTimeout(5000)
  const r = await page.evaluate(()=>{const f=window.__perf.frames;const s=[...f].sort((a,b)=>a-b);return{frames:f.length,p50:s[Math.floor(s.length*0.5)]||0,p95:s[Math.floor(s.length*0.95)]||0,p99:s[Math.floor(s.length*0.99)]||0,longest:s[s.length-1]||0,jankPct:f.length?+(f.filter(x=>x>16.67).length/f.length*100).toFixed(1):0,stutterPct:f.length?+(f.filter(x=>x>33.3).length/f.length*100).toFixed(1):0}})
  const expected = 5000/16.67
  console.log(`[${label.padEnd(40)}] frames=${r.frames}/${expected.toFixed(0)} p50=${r.p50.toFixed(1)} p95=${r.p95.toFixed(1)} p99=${r.p99.toFixed(1)} longest=${r.longest.toFixed(1)} jank=${r.jankPct}% stutter=${r.stutterPct}%`)
  await ctx.close()
}
try {
  console.log('Settle 3s, capture 5s in Webkit headless. Expected ~300 frames @ 60fps.\n')
  await pageTest("/three-flatland/", "landing (HeroShader + 6 FeatureCards)")
  await pageTest("/three-flatland/examples/", "examples gallery (no HeroShader)")
  await pageTest("/three-flatland/showcases/", "showcases (no HeroShader)")
  await pageTest("/three-flatland/getting-started/introduction/", "docs page (FeatureList, no HeroShader)")
  await pageTest("/three-flatland/guides/sprites/", "guide page (Pagination, no FC, no HeroShader)")
} finally { await browser.close(); await teardown() }
