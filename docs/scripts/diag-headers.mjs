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
async function checkPage(url, label) {
  const ctx = await browser.newContext({viewport:{width:1440,height:900}})
  const page = await ctx.newPage()
  await page.goto(`http://localhost:4321${url}`,{waitUntil:'domcontentloaded'})
  await page.waitForTimeout(2000)
  const r = await page.evaluate(() => {
    const layout = document.querySelector('[data-slot=layout]')
    const header = layout?.querySelector(':scope > header')
    if (!header) return { error: 'no header' }
    const cs = getComputedStyle(header)
    const r = header.getBoundingClientRect()
    const hero = document.querySelector('.hero-fullscreen')
    const heroRect = hero?.getBoundingClientRect()
    return {
      header: {
        height: Math.round(r.height),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        bgColor: cs.backgroundColor,
        borderBottom: cs.borderBottom,
        borderBottomWidth: cs.borderBottomWidth,
      },
      heroTop: heroRect ? Math.round(heroRect.top) : null,
      heroLeft: heroRect ? Math.round(heroRect.left) : null,
      heroWidth: heroRect ? Math.round(heroRect.width) : null,
      isLanding: layout?.hasAttribute('data-landing'),
    }
  })
  console.log(`\n[${label}]`)
  console.log(JSON.stringify(r, null, 2))
  await ctx.close()
}
try {
  await checkPage('/three-flatland/', 'landing')
  await checkPage('/three-flatland/getting-started/introduction/', 'docs')
} finally { await browser.close(); await teardown() }
