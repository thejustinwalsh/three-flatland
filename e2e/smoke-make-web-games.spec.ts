import { test, expect } from '@playwright/test'

test('make-web-games deck mounts: canvas, 11 slides, notes, advances', async ({ page }) => {
  await page.goto('/slides/make-web-games/')

  // R3F canvas backdrop present.
  await expect(page.locator('canvas.deck-bg, .deck-bg canvas').first()).toBeVisible({ timeout: 20_000 })

  // reveal initialized with exactly 11 sections, each carrying speaker notes.
  await expect(page.locator('.reveal .slides > section')).toHaveCount(11)
  expect(await page.locator('.reveal .slides aside.notes').count()).toBe(11)

  // First slide headline renders.
  await expect(page.getByText('MAKE WEB GAMES')).toBeVisible()

  // Advancing changes the active section (the scene director is store-driven off this).
  const firstPresent = await page.locator('.reveal .slides section.present').getAttribute('data-slide-index')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  const secondPresent = await page.locator('.reveal .slides section.present').getAttribute('data-slide-index')
  // present section changed (reveal toggles the .present class as you navigate)
  expect(secondPresent).not.toBe(firstPresent)
})
