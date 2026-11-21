import { test, expect } from '@playwright/test'
import { test as userTest, loadAllTestAccounts } from 'deepspace/testing'
import { captureConsoleErrors } from './helpers/errors'
import { interceptRecordsSocket, validAnalysisData } from './helpers/forged-write'
import { card, deleteFromLibrary, saveExampleAs, testName } from './helpers/analyses'

/**
 * Smoke tests covering both page kinds this template ships:
 *   - '/'      → the static landing (top level of src/pages/): no providers,
 *                so no auth fetch and no records WebSocket on load.
 *   - '/home'  → a dynamic page (under src/pages/(app)/): the providers mount,
 *                the nav shell renders, and the records WebSocket connects.
 *
 * The "static contract" test is the guardrail for the per-page opt-out: if
 * someone moves the providers back up into _app.tsx, it fails.
 */

/** Wait for the React app shell (present on every page). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Smoke tests', () => {
  test('static landing loads without JS errors', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    await expect(page.getByTestId('static-landing')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('landing carries one title, one description, one canonical', async ({ page }) => {
    // <Seo> (src/pages/index.tsx, values from src/seo.ts) hoists these into
    // <head>. Exactly one of each: index.html ships no static description or
    // canonical, because React 19 would not dedupe against them on mount.
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await expect(page).toHaveTitle(/\S/)
    expect(await page.locator('head meta[name="description"]').count()).toBe(1)
    expect(await page.locator('head link[rel="canonical"]').count()).toBe(1)
  })

  test('static contract: landing fires no auth request, opens no websocket', async ({ page }) => {
    const offenders: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/')) offenders.push(req.url())
    })
    // Only the DO room route counts — vite's own HMR socket is a dev artifact.
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) offenders.push(`ws: ${ws.url()}`)
    })
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await page.waitForTimeout(1500)
    expect(offenders).toEqual([])
  })

  test('dynamic app boundary mounts on /home', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 15000 })
  })

  test('sign-in button visible when logged out', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
  })
})

/**
 * Analyzer + saving (Steps 5-10).
 * Guest tests use plain Playwright; signed-in tests use the DeepSpace `users`
 * fixture (test accounts from `npx deepspace test accounts list --usable`).
 */
test.describe('Analyzer (guest)', () => {
  test('guest can analyze, but is asked to sign in to save', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/home')
    await page.getByRole('button', { name: 'Load example' }).click()

    // Real results from the real calculation
    await expect(page.getByText('43.2%').first()).toBeVisible()
    await expect(page.getByText('800 G+C of 1,850 known bases')).toBeVisible()

    // No save form for guests; a sign-in prompt instead, and no Library link
    await expect(page.getByRole('button', { name: 'Sign in to save' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save analysis' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Library' })).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('guest visiting /library is asked to sign in and sees no library', async ({ page }) => {
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Library' })).toHaveCount(0)
    await expect(page.getByTestId('analysis-card')).toHaveCount(0)
  })

  test('server refuses a guest save even when the UI is bypassed', async ({ page }) => {
    const socket = await interceptRecordsSocket(page)
    await page.goto('/home')

    try {
      expect(await socket.role()).toBe('viewer') // guests connect as 'viewer'
      const ack = await socket.forgeCreate('analyses', validAnalysisData())
      expect(ack.success).toBe(false)
      expect(ack.error).toMatch(/CREATE DENIED/)
    } finally {
      await socket.cleanup()
    }
  })
})

const hasTestAccount = loadAllTestAccounts().length >= 1

userTest.describe('Saving analyses (signed in)', () => {
  userTest.skip(!hasTestAccount, 'Needs 1 usable test account: npx deepspace test accounts create ...')

  userTest('save is private, confirmed, listed in the library, and survives a reload', async ({ users }) => {
    const [user] = await users(1)
    const { page } = user
    const name = testName('example')
    const saved = card(page, name)

    try {
      // saveExampleAs waits for "Saved": createConfirmed resolved, the server stored it
      await saveExampleAs(page, name)
      await page.getByRole('link', { name: 'Open your library' }).click()
      await expect(saved).toContainText('Private')
      await expect(saved).toContainText('2,000 bp')
      await expect(saved).toContainText('43.2%')

      // Reload: the record comes back from the database, not from memory
      await page.reload()
      await expect(saved).toBeVisible({ timeout: 15_000 })
      await expect(saved).toContainText('Private')
    } finally {
      await deleteFromLibrary(page, name) // also exercises delete
      await expect(saved).toHaveCount(0)
    }
  })

  userTest('server enforces the 25,000-nucleotide limit when the UI is bypassed', async ({ users }) => {
    const [user] = await users(1)
    const socket = await interceptRecordsSocket(user.page)
    await user.page.goto('/home')

    try {
      expect(await socket.role()).toBe('member')
      const tooLong = await socket.forgeCreate(
        'analyses',
        validAnalysisData({ sequence: 'A'.repeat(25_001), length: 25_001 }),
      )
      expect(tooLong.success).toBe(false)
      expect(tooLong.error).toMatch(/'sequence' must be text of at most 25000 characters/)
    } finally {
      await socket.cleanup()
    }
  })
})

/**
 * What the save UI does when the connection is unreliable. These pin the
 * behavior of the installed SDK (0.44.2), which differs from older docs:
 * re-run them after any SDK upgrade.
 */
userTest.describe('Saving over an unreliable connection (signed in)', () => {
  userTest.skip(!hasTestAccount, 'Needs 1 usable test account')

  userTest('connection drops before the server confirms: re-sent once, stored once', async ({ users }) => {
    const [user] = await users(1)
    const { page } = user
    let dropped = false
    let saveMessagesSent = 0
    await page.routeWebSocket(/\/ws\/app:/, (ws) => {
      const server = ws.connectToServer()
      ws.onMessage((m) => {
        if (String(m).includes('"core.put"')) saveMessagesSent++
        server.send(m)
      })
      server.onMessage((m) => {
        // The server stores the save; we lose its confirmation and the connection.
        if (!dropped && String(m).includes('"records.ack"')) {
          dropped = true
          ws.close()
          server.close()
          return
        }
        ws.send(m)
      })
    })

    const name = testName('dropped')
    const saved = card(page, name)
    await page.goto('/home')
    await page.getByRole('button', { name: 'Load example' }).click()
    await page.getByLabel('Analysis name').fill(name)
    await page.getByRole('button', { name: 'Save analysis' }).click()
    try {
      await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 30_000 })
      expect(dropped).toBe(true)
      expect(saveMessagesSent).toBe(2) // sent, then re-sent after reconnecting
      await page.goto('/library')
      await expect(page.getByRole('tab', { name: /^My analyses \(\d+\)/ })).toBeVisible({ timeout: 15_000 })
      await expect(saved).toHaveCount(1) // stored exactly once
    } finally {
      await deleteFromLibrary(page, name)
    }
  })

  userTest('server never confirms: honest error, no promise, button usable again', async ({ users }) => {
    userTest.setTimeout(90_000) // the SDK gives up after 3 connections x 10 s
    const [user] = await users(1)
    const { page } = user
    await page.routeWebSocket(/\/ws\/app:/, (ws) => {
      const server = ws.connectToServer()
      ws.onMessage((m) => {
        if (!String(m).includes('"core.put"')) server.send(m) // saves never arrive
      })
      server.onMessage((m) => ws.send(m))
    })

    await page.goto('/home')
    await page.getByRole('button', { name: 'Load example' }).click()
    await page.getByLabel('Analysis name').fill(`__test-${Date.now()}__ never confirmed`)
    await page.getByRole('button', { name: 'Save analysis' }).click()

    await expect(page.getByText('Waiting for the server to confirm this save.')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('The server did not confirm the save.').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/before saving again, to avoid a duplicate/).first()).toBeVisible()
    await expect(page.getByText('Waiting for the server to confirm this save.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save analysis' })).toBeEnabled({ timeout: 15_000 })
  })
})
