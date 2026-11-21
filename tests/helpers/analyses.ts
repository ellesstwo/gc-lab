import { expect, type Page } from '@playwright/test'

/** A unique, recognizable test name (the `__test-` prefix marks test data). */
export const testName = (label: string) => `__test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}__ ${label}`

/** Save the built-in example under `name` through the real UI, as a user would. */
export async function saveExampleAs(page: Page, name: string) {
  await page.goto('/home')
  await page.getByRole('button', { name: 'Load example' }).click()
  await page.getByLabel('Analysis name').fill(name)
  await page.getByRole('button', { name: 'Save analysis' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 15_000 })
}

/** The library card for `name` (only one test record has each name). */
export const card = (page: Page, name: string) => page.getByTestId('analysis-card').filter({ hasText: name })

/** Open a library tab: 'My analyses' or 'Shared by others'. */
export async function openTab(page: Page, tab: 'My analyses' | 'Shared by others') {
  await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
}

/** Delete every library card with this name, through the UI. Safe to call in `finally`. */
export async function deleteFromLibrary(page: Page, name: string) {
  if (!page.url().includes('/library')) await page.goto('/library')
  await openTab(page, 'My analyses')
  const cards = card(page, name)
  await expect(page.getByRole('tab', { name: /^My analyses \(\d+\)/ })).toBeVisible({ timeout: 15_000 })
  while (await cards.count()) {
    await cards.first().getByRole('button', { name: `Delete ${name}` }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0, { timeout: 15_000 })
  }
}

/**
 * Put a marker on the page's window object. If the page reloads or navigates,
 * the marker disappears, so `expectNoReload` proves an update arrived live.
 */
export async function markPage(page: Page) {
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true))
}
export async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
}

/** Save the example with a chosen window size (to prove reopening restores it). */
export async function saveExampleWithWindow(page: Page, name: string, windowSize: number) {
  await page.goto('/home')
  await page.getByRole('button', { name: 'Load example' }).click()
  const size = page.getByLabel('Window size (bp)')
  await size.fill(String(windowSize))
  await size.press('Enter')
  await expect(page.getByText(/windows? · allowed/)).toContainText(`${Math.ceil(2000 / windowSize)} windows`)
  await page.getByLabel('Analysis name').fill(name)
  await page.getByRole('button', { name: 'Save analysis' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 15_000 })
}

/** Check the analyzer shows the reopened example: same sequence, stats and window size. */
export async function expectReopenedExample(page: Page, name: string, windowSize: number) {
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByTestId('opened-from-library')).toContainText(name)
  const text = await page.getByLabel('DNA sequence').inputValue()
  expect(text.startsWith(`>${name}\n`)).toBe(true)
  await expect(page.getByText('2,000 / 25,000 nucleotides')).toBeVisible()
  await expect(page.getByText('800 G+C of 1,850 known bases')).toBeVisible() // same stats as saved
  await expect(page.getByLabel('Window size (bp)')).toHaveValue(String(windowSize))
  await expect(page.getByLabel('Analysis name')).toHaveValue(name) // FASTA header -> name
}
