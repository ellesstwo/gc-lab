/**
 * Unit tests for reopening saved analyses: toFasta() and readOpenAnalysis().
 */
import { describe, expect, it } from 'vitest'

import { readOpenAnalysis } from './open-analysis'
import { MAX_NUCLEOTIDES, parseSequenceInput, toFasta } from './sequence'

describe('toFasta', () => {
  it('writes a header and 60-base lines', () => {
    expect(toFasta('my seq', 'A'.repeat(130))).toBe(`>my seq\n${'A'.repeat(60)}\n${'A'.repeat(60)}\n${'A'.repeat(10)}\n`)
  })

  it.each([
    ['short', 'ACGTN'],
    ['with N runs', 'GGNNNNNNNNCC'],
    ['exactly the limit', 'ACGTN'.repeat(MAX_NUCLEOTIDES / 5)],
  ])('round-trips through the parser unchanged (%s)', (_label, sequence) => {
    const result = parseSequenceInput(toFasta('Saved analysis', sequence))
    expect(result).toEqual({ ok: true, value: { name: 'Saved analysis', sequence } })
  })
})

describe('readOpenAnalysis', () => {
  const valid = { name: 'x', sequence: 'ACGT', windowSize: 20, sharedBy: 'Tester A' }

  it('reads a valid open request', () => {
    expect(readOpenAnalysis({ openAnalysis: valid })).toEqual(valid)
  })

  it('treats a missing owner as your own analysis', () => {
    expect(readOpenAnalysis({ openAnalysis: { ...valid, sharedBy: undefined } })?.sharedBy).toBeNull()
  })

  it.each([
    ['no state (normal visit)', null],
    ['other state', { from: '/library' }],
    ['missing sequence', { openAnalysis: { ...valid, sequence: undefined } }],
    ['empty sequence', { openAnalysis: { ...valid, sequence: '' } }],
    ['bad window size', { openAnalysis: { ...valid, windowSize: 'big' } }],
    ['not an object', { openAnalysis: 'ACGT' }],
  ])('ignores %s', (_label, state) => {
    expect(readOpenAnalysis(state)).toBeNull()
  })
})
