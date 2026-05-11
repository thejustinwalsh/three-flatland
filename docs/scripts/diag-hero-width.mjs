import { chromium } from '@playwright/test'
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
const browser = await chromium.launch()
const ctx = await browser.newContext({viewport:{width:1440,height:900}})
const page = await ctx.newPage()
await page.goto('http://localhost:4321/three-flatland/',{waitUntil:'domcontentloaded'})
await page.waitForTimeout(2500)
const r = await page.evaluate(() => {
  const els = {
    'html': document.documentElement,
    'body': document.body,
    '.hero-fullscreen': document.querySelector('.hero-fullscreen'),
    '.hero-overlay': document.querySelector('.hero-overlay'),
    '.hero-overlay-inner': document.querySelector('.hero-overlay-inner'),
    '.hero-tagline': document.querySelector('.hero-tagline'),
    'hero parent (sl-markdown-content)': document.querySelector('.hero-fullscreen')?.parentElement,
    'hero grandparent (markdown-wrapper)': document.querySelector('.hero-fullscreen')?.parentElement?.parentElement,
    'hero ggparent (content-panel)': document.querySelector('.hero-fullscreen')?.parentElement?.parentElement?.parentElement,
    'main[data-pagefind-body]': document.querySelector('main[data-pagefind-body]'),
  }
  const out = {}
  for (const [name, el] of Object.entries(els)) {
    if (!el) { out[name] = '(missing)'; continue }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    out[name] = {
      width: Math.round(r.width),
      maxWidth: cs.maxWidth,
      margin: cs.margin,
      paddingInline: `${cs.paddingLeft} ${cs.paddingRight}`,
      left: Math.round(r.left),
      tagName: el.tagName,
      className: el.className?.toString?.()?.slice(0,80) || '',
    }
  }
  return out
})
console.log(JSON.stringify(r, null, 2))
await browser.close()
await teardown()
