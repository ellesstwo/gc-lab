/**
 * Reopening a saved analysis in the analyzer.
 *
 * The library's "Open in analyzer" link passes the saved analysis to /home
 * as React Router navigation state:
 *
 *   <Link to="/home" state={{ openAnalysis: { name, sequence, windowSize, sharedBy } }}>
 *
 * The analyzer reads it with readOpenAnalysis(location.state) and uses it as
 * its starting text and window size. No extra server request is made: the
 * data comes from a record the server already allowed this user to read.
 */

export interface OpenAnalysis {
  name: string
  sequence: string
  windowSize: number
  /** Owner's display name when it is someone else's shared analysis, else null. */
  sharedBy: string | null
}

/**
 * Safely read the navigation state. It is `unknown` because browser history
 * can hold anything (e.g. an older version of the app), so check every field
 * instead of trusting it. Returns null when there is nothing valid to open.
 */
export function readOpenAnalysis(state: unknown): OpenAnalysis | null {
  const value = (state as { openAnalysis?: unknown } | null)?.openAnalysis
  if (typeof value !== 'object' || value === null) return null
  const { name, sequence, windowSize, sharedBy } = value as Record<string, unknown>
  if (typeof name !== 'string' || typeof sequence !== 'string' || sequence === '') return null
  if (typeof windowSize !== 'number' || !Number.isFinite(windowSize)) return null
  return {
    name,
    sequence,
    windowSize,
    sharedBy: typeof sharedBy === 'string' ? sharedBy : null,
  }
}
