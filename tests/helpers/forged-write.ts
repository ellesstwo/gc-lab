import { expect, type Page, type WebSocketRoute } from '@playwright/test'

/**
 * Sit between the page and the app's records WebSocket so a test can send a
 * raw write the UI would never send (bypassing all browser-side validation)
 * and read the server's answer.
 *
 * Proves rules are enforced by the server, not just by the React code.
 * Everything else on the socket is passed through unchanged.
 *
 * Call before page.goto().
 */
export async function interceptRecordsSocket(page: Page) {
  let server: WebSocketRoute | undefined
  let role: string | undefined
  const acks = new Map<string, { success: boolean; error?: string }>()
  const created: { collection: string; recordId: string }[] = []
  const received: string[] = []

  await page.routeWebSocket(/\/ws\/app:/, (ws) => {
    const upstream = ws.connectToServer()
    ws.onMessage((message) => upstream.send(message))
    upstream.onMessage((message) => {
      if (typeof message === 'string') received.push(message)
      try {
        const msg = JSON.parse(typeof message === 'string' ? message : message.toString())
        if (msg.type === 'user.info') role = msg.payload?.role
        if (msg.type === 'records.ack' && msg.payload?.requestId) acks.set(msg.payload.requestId, msg.payload)
      } catch {
        // not JSON: just pass it through
      }
      ws.send(message)
    })
    server = upstream
  })

  return {
    /** The role the server assigned this connection (e.g. 'viewer', 'member'). */
    async role() {
      await expect.poll(() => role, { timeout: 15_000 }).toBeDefined()
      return role!
    },

    /** Send a raw create, exactly as the SDK would, and return the server's ack. */
    async forgeCreate(collection: string, data: Record<string, unknown>) {
      await expect.poll(() => role, { timeout: 15_000 }).toBeDefined() // socket is up
      const requestId = `forged-${Date.now()}-${Math.random().toString(36).slice(2)}`
      server!.send(
        JSON.stringify({ type: 'core.put', payload: { collection, recordId: requestId, data, requestId } }),
      )
      await expect.poll(() => acks.has(requestId), { timeout: 15_000 }).toBe(true)
      const ack = acks.get(requestId)!
      // If the server wrongly ACCEPTED it, remember it so cleanup() can remove it.
      if (ack.success) created.push({ collection, recordId: requestId })
      return { recordId: requestId, ...ack }
    },

    /** Send a raw update to an existing record (e.g. someone else's) and return the ack. */
    async forgeUpdate(collection: string, recordId: string, data: Record<string, unknown>) {
      await expect.poll(() => role, { timeout: 15_000 }).toBeDefined()
      const requestId = `forged-update-${Date.now()}-${Math.random().toString(36).slice(2)}`
      server!.send(JSON.stringify({ type: 'core.put', payload: { collection, recordId, data, requestId } }))
      await expect.poll(() => acks.has(requestId), { timeout: 15_000 }).toBe(true)
      return acks.get(requestId)!
    },

    /** Send a raw delete and return the ack. */
    async forgeDelete(collection: string, recordId: string) {
      await expect.poll(() => role, { timeout: 15_000 }).toBeDefined()
      const requestId = `forged-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`
      server!.send(JSON.stringify({ type: 'core.delete', payload: { collection, recordId, requestId } }))
      await expect.poll(() => acks.has(requestId), { timeout: 15_000 }).toBe(true)
      return acks.get(requestId)!
    },

    /** Every raw text frame the server sent this page (to prove what never arrived). */
    received,

    /**
     * Delete anything a forged write managed to create. Call in `finally`:
     * when a test fails because the server accepted a write it should have
     * refused, this keeps the bad record out of the dev database.
     * (Best effort: a guest may not be allowed to delete what it created.)
     */
    async cleanup() {
      for (const { collection, recordId } of created.splice(0)) {
        const requestId = `cleanup-${recordId}`
        server?.send(JSON.stringify({ type: 'core.delete', payload: { collection, recordId, requestId } }))
        await expect.poll(() => acks.has(requestId), { timeout: 10_000 }).toBe(true).catch(() => {})
      }
    },
  }
}

/** A well-formed analysis record, so a refusal can only be about permissions or limits. */
export function validAnalysisData(overrides: Record<string, unknown> = {}) {
  return {
    name: `__test-${Date.now()}__ forged`,
    sequence: 'ACGT',
    length: 4,
    gcPercent: 50,
    countA: 1,
    countC: 1,
    countG: 1,
    countT: 1,
    countN: 0,
    windowSize: 5,
    ...overrides,
  }
}
