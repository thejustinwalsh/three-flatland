import { expect, test } from '@playwright/test'

test('framework selection persists across hit-test groups, reloads and setup navigation', async ({ page }) => {
  await page.goto('examples/hit-test/')
  await expect(page.locator('h1#_top')).toHaveCount(1)
  const frameworkGroups = page.locator('starlight-tabs[data-sync-key="framework"]')
  await expect(frameworkGroups).toHaveCount(2)

  await frameworkGroups.first().getByRole('tab', { name: 'React', exact: true }).click()
  for (const group of await frameworkGroups.all()) {
    await expect(group.getByRole('tab', { name: 'React', exact: true })).toHaveAttribute('aria-selected', 'true')
  }

  await page.reload()
  for (const group of await frameworkGroups.all()) {
    await expect(group.getByRole('tab', { name: 'React', exact: true })).toHaveAttribute('aria-selected', 'true')
  }

  await page.goto('guides/flatland-setup/')
  const setupTabs = page.locator('starlight-tabs[data-sync-key="framework"]')
  await expect(setupTabs.getByRole('tab', { name: 'React', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(setupTabs.getByRole('tabpanel')).toContainText('useLoader')
  await setupTabs.getByRole('tab', { name: 'Three.js', exact: true }).click()

  await page.goto('examples/hit-test/')
  for (const group of await frameworkGroups.all()) {
    await expect(group.getByRole('tab', { name: 'Three.js', exact: true })).toHaveAttribute('aria-selected', 'true')
  }
})

test('desktop and mobile contents navigate without custom-element registration errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('guides/flatland/')
  await page.waitForFunction(() => customElements.get('flatland-toc') && customElements.get('mobile-starlight-toc'))

  await page.locator('flatland-toc').getByRole('link', { name: 'Object routing', exact: true }).click()
  await expect(page).toHaveURL(/#object-routing$/)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileContents = page.locator('mobile-starlight-toc')
  // The theme intentionally omits this header control below 420px.
  await expect(mobileContents.locator('summary')).toBeHidden()
  await page.setViewportSize({ width: 640, height: 900 })
  await mobileContents.locator('summary').click()
  await mobileContents.getByRole('link', { name: 'Frame synchronization', exact: true }).click()
  await expect(page).toHaveURL(/#frame-synchronization$/)
  expect(errors).toEqual([])
})
