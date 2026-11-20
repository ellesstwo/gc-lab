/**
 * GC content calculations.
 *
 * Port of the calculation parts of exercise1.py, with the window bugs fixed.
 * Input is always a sequence already cleaned by parseSequenceInput() in
 * ./sequence.ts: uppercase and only A, C, G, T, N.
 *
 * Positions are 0-based and windows are half-open [start, end), the same
 * convention as Python slicing: genome[start:end].
 *
 * Changes from the original (all approved in the plan):
 * 1. Each window holds exactly windowSize bases: [start, start + windowSize).
 *    The original used genome[i-p:i-1], which is one base short.
 * 2. The last window is kept, even when it is shorter than windowSize.
 *    The original's range(p, len(genome), p) always dropped it.
 * 3. GC% = (G + C) / (A + C + G + T). N is excluded from the denominator.
 *    The original divided by the window length, N included.
 * 4. Windows that are 80% N or more are gaps (gcPercent: null). The original
 *    filled windows with more than 80% N with the whole-region average.
 *    Using >= (not >) means a 5-base window like "NNNNG" is a gap instead of
 *    reporting 100% GC from a single known base.
 * 5. Every base is visited once per calculation (the original re-counted
 *    the whole genome on every loop iteration).
 */

/** Smallest window allowed, from the original: `if p < 5: p = 5`. */
export const MIN_WINDOW_SIZE = 5

/** The default window size aims for about this many windows: `ceil(len / 100)`. */
export const TARGET_WINDOW_COUNT = 100

/** Upper limit on windows, so the chart never has more than this many points. */
export const MAX_WINDOW_COUNT = 1000

/**
 * A window whose N fraction is at or above this is a gap (>= 0.8).
 * The original used > 0.8; >= was chosen so exactly-80%-N windows are gaps too.
 */
export const N_GAP_THRESHOLD = 0.8

export interface BaseCounts {
  A: number
  C: number
  G: number
  T: number
  N: number
}

export interface GcWindow {
  /** First position in the window (0-based, included). */
  start: number
  /** Position just after the window (0-based, excluded). end - start = window length. */
  end: number
  /** GC% of the A/C/G/T bases in the window, or null if the window is mostly N. */
  gcPercent: number | null
  /** Fraction of the window that is N, from 0 to 1. */
  nFraction: number
}

/**
 * Count each base in the sequence.
 * Original: genome.count('a'), genome.count('t'), ... (one pass per base).
 * Here: a single pass that counts all five at once.
 */
export function countBases(sequence: string): BaseCounts {
  const counts: BaseCounts = { A: 0, C: 0, G: 0, T: 0, N: 0 }
  for (let i = 0; i < sequence.length; i++) {
    const base = sequence[i]
    if (base === 'A' || base === 'C' || base === 'G' || base === 'T' || base === 'N') {
      counts[base]++
    } else {
      // Should be impossible after parseSequenceInput(); fail loudly rather
      // than silently ignore a character and report wrong numbers.
      throw new Error(
        `Unexpected character ${JSON.stringify(base)} at position ${i}. ` +
          'Clean the sequence with parseSequenceInput() first.',
      )
    }
  }
  return counts
}

/**
 * GC% = (G + C) / (A + C + G + T) * 100.
 * Returns null when there are no A/C/G/T bases at all (e.g. "NNNN"),
 * because 0/0 has no meaningful answer.
 */
export function calculateGcPercent(counts: BaseCounts): number | null {
  const acgt = counts.A + counts.C + counts.G + counts.T
  if (acgt === 0) return null
  return ((counts.G + counts.C) / acgt) * 100
}

/**
 * Default window size, from the original:
 *   p = math.ceil(len(genome)/100)
 *   if p < 5: p = 5
 * then kept inside the allowed range (see windowSizeLimits).
 */
export function defaultWindowSize(sequenceLength: number): number {
  const { min, max } = windowSizeLimits(sequenceLength)
  const size = Math.ceil(sequenceLength / TARGET_WINDOW_COUNT)
  return Math.min(Math.max(size, min), max)
}

/**
 * The window sizes the user may choose for a sequence of this length.
 * - min: at least MIN_WINDOW_SIZE, and large enough that there are at most
 *   MAX_WINDOW_COUNT windows.
 * - max: the whole sequence as one window (but never below min, so a very
 *   short sequence still gets a valid range).
 */
export function windowSizeLimits(sequenceLength: number): { min: number; max: number } {
  const min = Math.max(MIN_WINDOW_SIZE, Math.ceil(sequenceLength / MAX_WINDOW_COUNT))
  const max = Math.max(min, sequenceLength)
  return { min, max }
}

/**
 * GC% in non-overlapping windows: [0, w), [w, 2w), [2w, 3w), ...
 * The last window may be shorter than windowSize; it is kept.
 *
 * Original (second loop in exercise1.py):
 *   for i in range(p, len(genome), p):
 *       substring = genome[i-p:i-1]            # bug: one base short
 *       if substring.count('n') / win_len > 0.8: summary.append([prop_gc, ...])
 *       else: gc_content = (count('g') + count('c')) / win_len
 */
export function gcWindows(sequence: string, windowSize: number): GcWindow[] {
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    throw new RangeError(`windowSize must be a positive whole number, got ${windowSize}`)
  }

  const windows: GcWindow[] = []

  for (let start = 0; start < sequence.length; start += windowSize) {
    const end = Math.min(start + windowSize, sequence.length)
    const counts = countBases(sequence.slice(start, end))
    const nFraction = counts.N / (end - start)

    windows.push({
      start,
      end,
      // 80% N or more: leave a gap. Otherwise more than 20% of the window is
      // A/C/G/T, so calculateGcPercent() never returns null here.
      gcPercent: nFraction >= N_GAP_THRESHOLD ? null : calculateGcPercent(counts),
      nFraction,
    })
  }

  return windows
}

/**
 * Keep a requested window size inside the allowed range for this length.
 * Non-whole numbers are rounded; anything unusable falls back to the default.
 */
export function clampWindowSize(requested: number, sequenceLength: number): number {
  if (!Number.isFinite(requested)) return defaultWindowSize(sequenceLength)
  const { min, max } = windowSizeLimits(sequenceLength)
  return Math.min(Math.max(Math.round(requested), min), max)
}

/** Everything the analyzer page shows for one sequence. */
export interface SequenceAnalysis {
  length: number
  counts: BaseCounts
  /** Overall GC% of A/C/G/T bases, or null if the sequence is all N. */
  gcPercent: number | null
  /** The window size actually used (after clamping). */
  windowSize: number
  defaultWindowSize: number
  windowSizeLimits: { min: number; max: number }
  windows: GcWindow[]
}

/**
 * Run all the calculations for one cleaned sequence. This is the single
 * entry point the UI uses, so the stats and the chart always come from the
 * same tested functions above.
 *
 * @param requestedWindowSize the user's choice, or null for the default.
 */
export function analyzeSequence(
  sequence: string,
  requestedWindowSize: number | null = null,
): SequenceAnalysis {
  const length = sequence.length
  const counts = countBases(sequence)
  const windowSize =
    requestedWindowSize === null
      ? defaultWindowSize(length)
      : clampWindowSize(requestedWindowSize, length)

  return {
    length,
    counts,
    gcPercent: calculateGcPercent(counts),
    windowSize,
    defaultWindowSize: defaultWindowSize(length),
    windowSizeLimits: windowSizeLimits(length),
    windows: gcWindows(sequence, windowSize),
  }
}
