/**
 * Unit tests for the GC calculations in ./gc.ts.
 * Run with: npm run test:unit
 *
 * Every expected number here can be checked by hand.
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeSequence,
  calculateGcPercent,
  clampWindowSize,
  countBases,
  defaultWindowSize,
  gcWindows,
  MAX_WINDOW_COUNT,
  windowSizeLimits,
} from './gc'

/** Shorthand: overall GC% of a sequence. */
const gcOf = (sequence: string) => calculateGcPercent(countBases(sequence))

/** Shorthand: just the [start, end) pairs of each window. */
const boundaries = (sequence: string, windowSize: number) =>
  gcWindows(sequence, windowSize).map((w) => [w.start, w.end])

describe('countBases', () => {
  it('counts each base in a single pass', () => {
    expect(countBases('AACGTTTNN')).toEqual({ A: 2, C: 1, G: 1, T: 3, N: 2 })
  })

  it('returns all zeros for an empty string', () => {
    expect(countBases('')).toEqual({ A: 0, C: 0, G: 0, T: 0, N: 0 })
  })

  it('throws on characters the parser should have rejected', () => {
    expect(() => countBases('ACGX')).toThrow(/Unexpected character "X" at position 3/)
    expect(() => countBases('acgt')).toThrow() // lowercase means it was not parsed
  })
})

describe('overall GC percentage', () => {
  it.each([
    ['GGGGAAAA', 50], // 4 / 8
    ['GCGC', 100], // 4 / 4
    ['ATAT', 0], // 0 / 4
    ['GCGCGATATAT', (5 / 11) * 100], // 45.45...
    ['ACGTACGTAC', 50], // 5 / 10
    ['G', 100],
  ])('GC of %s is %s percent', (sequence, expected) => {
    expect(gcOf(sequence)).toBeCloseTo(expected, 10)
  })

  it('excludes N from the denominator: GCNNNAT = 2 / 4 = 50%, not 2 / 7', () => {
    expect(gcOf('GCNNNAT')).toBe(50)
  })

  it('returns null when there are no A/C/G/T bases (0 / 0)', () => {
    expect(gcOf('NNNN')).toBeNull()
    expect(gcOf('')).toBeNull()
  })
})

describe('window boundaries', () => {
  it('makes non-overlapping windows of exactly windowSize bases', () => {
    // The original exercise1.py sliced genome[i-p:i-1], one base short.
    expect(boundaries('AAAAAAAAAAAA', 4)).toEqual([
      [0, 4],
      [4, 8],
      [8, 12],
    ])
  })

  it('covers every base exactly once, with no gaps or overlaps', () => {
    const sequence = 'ACGT'.repeat(250) // 1,000 bases
    const windows = gcWindows(sequence, 7)
    expect(windows[0].start).toBe(0)
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].start).toBe(windows[i - 1].end)
    }
    expect(windows[windows.length - 1].end).toBe(sequence.length)
  })

  it('computes GC per window: GGGGAAAA with window 4 is 100%, then 0%', () => {
    expect(gcWindows('GGGGAAAA', 4).map((w) => w.gcPercent)).toEqual([100, 0])
  })

  it('makes 100 windows of 10 for 1,000 bases (the original made 99 windows of 9)', () => {
    const windows = gcWindows('GGCCAATTGC'.repeat(100), 10)
    expect(windows).toHaveLength(100)
    expect(windows.every((w) => w.end - w.start === 10)).toBe(true)
    expect(windows[0].gcPercent).toBe(60) // GGCCAATTGC: 6 of 10
  })

  it('makes one window when windowSize is larger than the sequence', () => {
    expect(boundaries('ACGT', 10)).toEqual([[0, 4]])
  })

  it('returns no windows for an empty sequence', () => {
    expect(gcWindows('', 5)).toEqual([])
  })

  it.each([0, -1, 2.5, Number.NaN])('rejects window size %s', (size) => {
    expect(() => gcWindows('ACGT', size)).toThrow(RangeError)
  })
})

describe('final partial window', () => {
  it('keeps a shorter last window (the original dropped it)', () => {
    // GCGC | GATA | TAT
    expect(gcWindows('GCGCGATATAT', 4)).toEqual([
      { start: 0, end: 4, gcPercent: 100, nFraction: 0 },
      { start: 4, end: 8, gcPercent: 25, nFraction: 0 },
      { start: 8, end: 11, gcPercent: 0, nFraction: 0 },
    ])
  })

  it('computes the last window from its real length', () => {
    // AAAAA | GC  -> the last window is 2 bases, both G/C = 100%
    expect(gcWindows('AAAAAGC', 5).at(-1)).toEqual({ start: 5, end: 7, gcPercent: 100, nFraction: 0 })
  })

  it('keeps a 1-base last window', () => {
    expect(boundaries('AAAAAG', 5)).toEqual([
      [0, 5],
      [5, 6],
    ])
  })
})

describe('windows containing N', () => {
  it('reports the N fraction of each window', () => {
    expect(gcWindows('GCNNNAT', 7)[0].nFraction).toBeCloseTo(3 / 7, 10)
  })

  it('excludes N from a window denominator: GCNAT = 2 / 4 = 50%', () => {
    expect(gcWindows('GCNAT', 5)[0]).toMatchObject({ gcPercent: 50, nFraction: 0.2 })
  })

  it('keeps windows below 80% N: GNNNA is 60% N, GC = 1 / 2 = 50%', () => {
    expect(gcWindows('GNNNA', 5)[0]).toMatchObject({ gcPercent: 50, nFraction: 0.6 })
  })

  it('makes an all-N window a gap (null)', () => {
    expect(gcWindows('NNNNN', 5)[0]).toMatchObject({ gcPercent: null, nFraction: 1 })
  })

  it('leaves gaps only where N is, not around them', () => {
    // GGCCG | NNNNN | ACGTN | NNNN
    expect(gcWindows('GGCCGNNNNNACGTNNNNN', 5).map((w) => w.gcPercent)).toEqual([
      100,
      null,
      50,
      null,
    ])
  })
})

describe('exactly 80% N (threshold is >= 0.8)', () => {
  it('makes NNNNG a gap instead of reporting 100% GC from one base', () => {
    expect(gcWindows('NNNNG', 5)[0]).toMatchObject({ gcPercent: null, nFraction: 0.8 })
  })

  it.each([
    ['5-base window, 4 N', 'NNNNG'],
    ['10-base window, 8 N', 'NNNNNNNNGC'],
    ['250-base window, 200 N', 'N'.repeat(200) + 'GC'.repeat(25)],
  ])('%s is a gap', (_label, window) => {
    expect(gcWindows(window, window.length)[0].gcPercent).toBeNull()
  })

  it('keeps a window just under 80%: 7 N of 10 = 70%', () => {
    expect(gcWindows('NNNNNNNGCA', 10)[0]).toMatchObject({ gcPercent: (2 / 3) * 100 })
  })

  it('applies the threshold to the final partial window by its real length', () => {
    // GCGCG | NNNNA : the last window has 4 N of 5 = 80% -> gap
    // GCGCG | NNNA  : the last window has 3 N of 4 = 75% -> 0% GC
    expect(gcWindows('GCGCGNNNNA', 5)[1].gcPercent).toBeNull()
    expect(gcWindows('GCGCGNNNA', 5)[1].gcPercent).toBe(0)
  })
})

describe('window size defaults and limits', () => {
  it.each([
    // length, default (ceil(length / 100), at least 5)
    [3, 5],
    [20, 5],
    [500, 5],
    [501, 6],
    [1000, 10],
    [1234, 13],
    [25_000, 250],
  ])('a %d-base sequence defaults to window %d', (length, expected) => {
    expect(defaultWindowSize(length)).toBe(expected)
  })

  it(`never allows more than ${MAX_WINDOW_COUNT} windows`, () => {
    for (const length of [1000, 5000, 12_345, 25_000]) {
      const { min } = windowSizeLimits(length)
      expect(Math.ceil(length / min)).toBeLessThanOrEqual(MAX_WINDOW_COUNT)
    }
    expect(windowSizeLimits(25_000)).toEqual({ min: 25, max: 25_000 })
  })

  it('gives a valid range even for a sequence shorter than 5 bases', () => {
    expect(windowSizeLimits(3)).toEqual({ min: 5, max: 5 })
  })

  it('keeps about 100 windows at the default size for a full 25,000-base sequence', () => {
    const sequence = 'ACGTN'.repeat(5000)
    expect(gcWindows(sequence, defaultWindowSize(sequence.length))).toHaveLength(100)
  })
})

describe('clampWindowSize', () => {
  it('keeps sizes inside the limits for the sequence length', () => {
    expect(clampWindowSize(1, 25_000)).toBe(25) // below min
    expect(clampWindowSize(99_999, 2000)).toBe(2000) // above max
    expect(clampWindowSize(50, 2000)).toBe(50) // already valid
  })

  it('rounds non-whole numbers and falls back to the default for NaN', () => {
    expect(clampWindowSize(10.6, 1000)).toBe(11)
    expect(clampWindowSize(Number.NaN, 1000)).toBe(10)
  })
})

describe('analyzeSequence', () => {
  it('combines counts, overall GC and windows from the same sequence', () => {
    const analysis = analyzeSequence('GCGCGATATAT', 4)
    expect(analysis).toMatchObject({
      length: 11,
      counts: { A: 3, C: 2, G: 3, T: 3, N: 0 },
      windowSize: 5, // 4 was requested, but the minimum is 5
      defaultWindowSize: 5,
      windowSizeLimits: { min: 5, max: 11 },
    })
    expect(analysis.gcPercent).toBeCloseTo((5 / 11) * 100, 10)
    // 4 is below the minimum of 5, so it is clamped: GCGCG | ATATA | T
    expect(analysis.windows.map((w) => w.gcPercent)).toEqual([100, 0, 0])
  })

  it('uses the default window size when none is requested', () => {
    const analysis = analyzeSequence('ACGT'.repeat(250))
    expect(analysis.windowSize).toBe(10)
    expect(analysis.windows).toHaveLength(100)
  })

  it('reports null GC for an all-N sequence, with every window a gap', () => {
    const analysis = analyzeSequence('N'.repeat(20))
    expect(analysis.gcPercent).toBeNull()
    expect(analysis.windows.every((w) => w.gcPercent === null)).toBe(true)
  })
})
