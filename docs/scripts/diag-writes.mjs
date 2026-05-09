import { webkit } from '@playwright/test'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
let server = null
async function probe() { try { return (await fetch('http://localhost:4321/three-flatland/', { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }
async function ensureServer() {
  if (await probe()) return
  server = spawn('pnpm', ['--filter=docs', 'dev'], { cwd: resolve(import.meta.dirname, '..'), stdio: ['ignore','pipe','pipe'], env: { ...process.env, TURBO_MFE_PORT: '4321' } })
  server.stdout.on('data', () => {}); server.stderr.on('data', () => {})
  const dl = Date.now() + 60000
  while (Date.now() < dl) { await new Promise(r=>setTimeout(r,500)); if (await probe()) return }
  process.exit(1)
}
async function teardown() { if (server) { server.kill('SIGTERM'); await new Promise(r=>setTimeout(r,800)) } }
process.on('SIGINT', () => teardown().finally(() => process.exit(130)))

await ensureServer()
const browser = await webkit.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://localhost:4321/three-flatland/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

// Wrap setProperty to count calls + record names
const result = await page.evaluate(async () => {
  let writes = 0
  const byName = {}
  const targets = document.querySelectorAll('[data-light], .u-light, .feature-card, .value-prop')
  for (const el of [document.documentElement, ...targets]) {
    const orig = el.style.setProperty.bind(el.style)
    el.style.setProperty = (name, value, priority) => {
      writes++
      byName[name] = (byName[name] || 0) + 1
      return orig(name, value, priority)
    }
  }
  await new Promise(r => setTimeout(r, 4000))
  return { totalWrites: writes, byName, targetCount: targets.length, frameBudget: 60 * 4 }
})
console.log(JSON.stringify(result, null, 2))
console.log(`\nWrites per frame (4s × 60fps target): ${(result.totalWrites / result.frameBudget).toFixed(2)}`)
console.log(`Targets monitored: ${result.targetCount}`)
await browser.close()
await teardown()
