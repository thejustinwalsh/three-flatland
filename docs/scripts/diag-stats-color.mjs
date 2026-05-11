import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const PORT = 4321
let server = null
async function probe() { try { return (await fetch(`http://localhost:${PORT}/three-flatland/`, { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }
async function ensureServer() {
  if (await probe()) return
  server = spawn('pnpm',['--filter=docs','dev'],{cwd:resolve(import.meta.dirname,'..'),stdio:['ignore','pipe','pipe'],env:{...process.env,TURBO_MFE_PORT:String(PORT)}})
  server.stdout.on('data',()=>{});server.stderr.on('data',()=>{})
  const dl=Date.now()+60000;while(Date.now()<dl){await new Promise(r=>setTimeout(r,500));if(await probe())return};process.exit(1)
}
async function teardown() { if(server){server.kill('SIGTERM');await new Promise(r=>setTimeout(r,800))} }
process.on('SIGINT',()=>teardown().finally(()=>process.exit(130)))
await ensureServer()
const browser = await webkit.launch()
console.log(`webkit ${await browser.version()}`)
const ctx = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})
const page = await ctx.newPage()
await page.goto(`http://localhost:${PORT}/three-flatland/`,{waitUntil:'domcontentloaded'})
await page.waitForTimeout(2500)
const r = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.stat-item')]
  return items.map(item => {
    const value = item.querySelector('.stat-value')
    const cs = value ? getComputedStyle(value) : null
    const itemCs = getComputedStyle(item)
    return {
      gem: item.getAttribute('data-gem'),
      inlineStyle: item.getAttribute('style'),
      statAccentValue: itemCs.getPropertyValue('--stat-accent').trim(),
      valueColor: cs ? cs.color : null,
      valueText: value ? value.textContent : null,
    }
  })
})
console.log(JSON.stringify(r, null, 2))
await browser.close()
await teardown()
