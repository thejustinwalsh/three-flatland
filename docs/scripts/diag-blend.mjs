import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
let server = null
async function probe() { try { return (await fetch('http://localhost:4321/three-flatland/examples/', { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }
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
async function test(name, css) {
  const ctx = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})
  const page = await ctx.newPage()
  await page.goto('http://localhost:4321/three-flatland/examples/',{waitUntil:'domcontentloaded'})
  if (css) await page.addStyleTag({content: css})
  await page.waitForTimeout(3000)
  await page.evaluate(()=>{window.__perf={frames:[],lastTs:0};const tick=ts=>{if(window.__perf.lastTs)window.__perf.frames.push(ts-window.__perf.lastTs);window.__perf.lastTs=ts;requestAnimationFrame(tick)};requestAnimationFrame(tick)})
  await page.waitForTimeout(5000)
  const r = await page.evaluate(()=>{const f=window.__perf.frames;const s=[...f].sort((a,b)=>a-b);return{frames:f.length,p50:s[Math.floor(s.length*0.5)]||0,p95:s[Math.floor(s.length*0.95)]||0,p99:s[Math.floor(s.length*0.99)]||0,jankPct:f.length?+(f.filter(x=>x>16.67).length/f.length*100).toFixed(1):0,stutterPct:f.length?+(f.filter(x=>x>33.3).length/f.length*100).toFixed(1):0}})
  console.log(`[${name.padEnd(48)}] frames=${r.frames}/300 p50=${r.p50.toFixed(0)} p95=${r.p95.toFixed(0)} p99=${r.p99.toFixed(0)} stutter=${r.stutterPct}%`)
  await ctx.close()
}
try {
  console.log('Examples page in Webkit. Each test independent.\n')
  await test('A. baseline (current rim CSS)', null)
  await test('B. mix-blend-mode disabled', `.tile-edge, .tile-edge::before, .tile-edge::after { mix-blend-mode: normal !important; }`)
  await test('C. mask-composite disabled', `.tile-edge, .tile-edge::before, .tile-edge::after { -webkit-mask-composite: source-over !important; mask-composite: add !important; }`)
  await test('D. ::before+::after display:none', `.tile-edge::before, .tile-edge::after { display: none !important; }`)
  await test('E. tile-edge entirely hidden', `.tile-edge { display: none !important; }`)
  await test('F. contain:paint per tile', `.gallery-tile { contain: paint !important; isolation: isolate !important; }`)
} finally { await browser.close(); await teardown() }
