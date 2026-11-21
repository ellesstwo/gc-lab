/**
 * Turning an analysis into a database record, and save errors into messages.
 *
 * Pure functions (no React, no network) so they are easy to unit test.
 */
import type { Analysis } from '@/schemas/analyses-schema'
import type { SequenceAnalysis } from './gc'
import { MAX_NAME_LENGTH } from './sequence'

export const DEFAULT_ANALYSIS_NAME = 'Untitled analysis'

/** Trim and shorten a name to what the database accepts; blank becomes the default. */
export function cleanAnalysisName(name: string | null | undefined): string {
  const cleaned = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim()
  return cleaned === '' ? DEFAULT_ANALYSIS_NAME : cleaned
}

/**
 * Build the record to save. Every number comes from analyzeSequence(), the
 * same tested code that drew the stats and chart the user is looking at.
 * New analyses are always private; sharing is a separate, deliberate action.
 */
export function buildAnalysisRecord(
  name: string | null | undefined,
  sequence: string,
  analysis: SequenceAnalysis,
): Analysis {
  return {
    name: cleanAnalysisName(name),
    sequence,
    length: analysis.length,
    gcPercent: analysis.gcPercent,
    countA: analysis.counts.A,
    countC: analysis.counts.C,
    countG: analysis.counts.G,
    countT: analysis.counts.T,
    countN: analysis.counts.N,
    windowSize: analysis.windowSize,
    visibility: 'private',
  }
}

/**
 * Explain why a confirmed write failed, in words a user can act on.
 *
 * Behavior of SDK 0.44.2 (read from its source and tested):
 * - not_ready:   the connection was never ready; nothing was sent.
 * - cancelled:   never sent (signed out / left the page); nothing changed.
 * - unconfirmed: sent, but the server never answered on 3 connections
 *   (~30 s). It MAY have been applied, so the user must check before retrying.
 * Some SDK versions instead reject with 'WebSocket disconnected' (sent, outcome
 * unknown) or 'WebSocket not connected' (not sent); both are handled too.
 * Refusals from the server carry the server's message.
 */
export function describeSaveError(err: unknown, action: 'save' | 'delete' = 'save'): string {
  const code = (err as { code?: unknown } | null)?.code
  const message = err instanceof Error ? err.message : String(err ?? '')
  const outcomeUnknown =
    action === 'save'
      ? `It may or may not have been stored: check “Your saved analyses” before saving again, to avoid a duplicate.`
      : `It may or may not have been deleted: check the list before trying again.`

  if (code === 'not_ready' || /WebSocket not connected/i.test(message)) {
    return `Not connected to the server, so nothing was sent. Wait a moment and try again.`
  }
  if (code === 'unconfirmed') {
    return `The server did not confirm the ${action}. ${outcomeUnknown}`
  }
  if (/WebSocket disconnected/i.test(message)) {
    return `The connection dropped before the server confirmed the ${action}. ${outcomeUnknown}`
  }
  if (code === 'cancelled') {
    return `The ${action} was cancelled before it was sent (you signed out or left the page). Nothing was changed.`
  }
  if (/DENIED|permission/i.test(message)) {
    return `You do not have permission to ${action} this. Sign in and try again.`
  }
  if (/must be text of at most/i.test(message)) {
    return `The server refused the ${action}: ${message}.`
  }
  return message ? `Could not ${action}: ${message}` : `Could not ${action}. Please try again.`
}
