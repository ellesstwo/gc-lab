/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { interceptRecordsSocket } from './helpers/forged-write'
import { card, deleteFromLibrary, expectNoReload, markPage, openTab, saveExampleAs, testName } from './helpers/analyses'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(1)
  let shouldFail = false
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { integrations: { openai: {}, wikipedia: {} } } }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(1)
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

/**
 * Sharing analyses between two real accounts (Steps 11-12).
 *
 * Each test proves an update arrived LIVE: a marker is set on the second
 * user's page before the change, and must still be there after (a reload
 * or navigation would erase it).
 */
test.describe('Sharing analyses between two users', () => {
  test('a private analysis is visible only to its owner, and never reaches the other browser', async ({ users }) => {
    const [owner, other] = await users(2)
    const otherSocket = await interceptRecordsSocket(other.page) // records every frame B receives
    const name = testName('private')

    try {
      await other.page.goto('/library')
      await expect(other.page.getByRole('tab', { name: /^Shared by others \(\d+\)/ })).toBeVisible({ timeout: 15_000 })

      await saveExampleAs(owner.page, name)
      await owner.page.goto('/library')
      const ownerCard = card(owner.page, name)
      await expect(ownerCard).toContainText('Private')
      const recordId = (await ownerCard.getAttribute('data-record-id'))!

      // B's library: in neither tab
      await other.page.waitForTimeout(2_000) // give the server time to (wrongly) broadcast
      await openTab(other.page, 'Shared by others')
      await expect(card(other.page, name)).toHaveCount(0)
      await openTab(other.page, 'My analyses')
      await expect(card(other.page, name)).toHaveCount(0)

      // Stronger: the record was never sent to B's browser at all
      expect(otherSocket.received.some((frame) => frame.includes(name))).toBe(false)

      // And B cannot change or delete it, even by sending raw messages
      const update = await otherSocket.forgeUpdate('analyses', recordId, { visibility: 'shared' })
      expect(update.success).toBe(false)
      const removal = await otherSocket.forgeDelete('analyses', recordId)
      expect(removal.success).toBe(false)
      await owner.page.reload()
      await expect(card(owner.page, name)).toContainText('Private') // unchanged
    } finally {
      await deleteFromLibrary(owner.page, name)
    }
  })

  test('sharing makes it appear for the other user without refreshing', async ({ users }) => {
    const [owner, other] = await users(2)
    const otherSocket = await interceptRecordsSocket(other.page)
    const name = testName('shared')

    try {
      await saveExampleAs(owner.page, name)
      await owner.page.goto('/library')
      const ownerCard = card(owner.page, name)
      await expect(ownerCard).toContainText('Private')

      // B is already looking at "Shared by others"
      await other.page.goto('/library')
      await openTab(other.page, 'Shared by others')
      await expect(card(other.page, name)).toHaveCount(0)
      await markPage(other.page)

      // A flips the switch
      await ownerCard.getByRole('switch', { name: 'Share with everyone' }).click()
      await expect(ownerCard).toContainText('Shared', { timeout: 15_000 })

      // B sees it appear, live
      const otherCard = card(other.page, name)
      await expect(otherCard).toBeVisible({ timeout: 10_000 })
      await expect(otherCard).toContainText('Shared by')
      await expect(otherCard).not.toContainText('another user') // owner's name resolved
      await expect(otherCard).toContainText('43.2%')
      await expectNoReload(other.page)

      // B gets no controls for it, and the server refuses B's raw attempts
      await expect(otherCard.getByRole('switch')).toHaveCount(0)
      await expect(otherCard.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
      const recordId = (await otherCard.getAttribute('data-record-id'))!
      expect((await otherSocket.forgeUpdate('analyses', recordId, { name: 'hijacked' })).success).toBe(false)
      expect((await otherSocket.forgeDelete('analyses', recordId)).success).toBe(false)
      await expect(otherCard).toBeVisible()
    } finally {
      await deleteFromLibrary(owner.page, name)
    }
  })

  test('making it private again removes it from the other user without refreshing', async ({ users }) => {
    const [owner, other] = await users(2)
    const name = testName('unshared')

    try {
      await saveExampleAs(owner.page, name)
      await owner.page.goto('/library')
      const ownerCard = card(owner.page, name)
      const sharing = ownerCard.getByRole('switch', { name: 'Share with everyone' })
      await sharing.click()
      await expect(ownerCard).toContainText('Shared', { timeout: 15_000 })

      await other.page.goto('/library')
      await openTab(other.page, 'Shared by others')
      const otherCard = card(other.page, name)
      await expect(otherCard).toBeVisible({ timeout: 10_000 })
      await markPage(other.page)

      // A makes it private again
      await sharing.click()
      await expect(ownerCard).toContainText('Private', { timeout: 15_000 })

      // It disappears from B's library, live, and the tab count follows
      await expect(otherCard).toHaveCount(0, { timeout: 10_000 })
      await expectNoReload(other.page)

      // Still gone after a real reload (not just hidden on the page)
      await other.page.reload()
      await openTab(other.page, 'Shared by others')
      await expect(other.page.getByRole('tab', { name: /^Shared by others \(\d+\)/ })).toBeVisible({ timeout: 15_000 })
      await expect(card(other.page, name)).toHaveCount(0)
    } finally {
      await deleteFromLibrary(owner.page, name)
    }
  })
})
