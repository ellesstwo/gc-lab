/**
 * Unit tests for the synthetic example in ./example.ts.
 */
import { describe, expect, it } from 'vitest'
import { EXAMPLE_FASTA, EXAMPLE_NAME } from './example'
import { gcWindows } from './gc'
import { parseSequenceInput } from './sequence'

describe('example sequence', () => {
  const result = parseSequenceInput(EXAMPLE_FASTA)
  if (!result.ok) throw new Error(`Example does not parse: ${result.error.message}`)
  const { name, sequence } = result.value

  it('is a valid FASTA record labeled as synthetic', () => {
    expect(name).toBe(EXAMPLE_NAME)
    expect(name).toMatch(/^Synthetic/)
  })

  it('has 2,000 bases', () => {
    expect(sequence).toHaveLength(2000)
  })

  it('contains a 150-base run of N that becomes gaps in the chart', () => {
    expect(sequence.slice(1000, 1150)).toBe('N'.repeat(150))
    const gaps = gcWindows(sequence, 50).filter((w) => w.gcPercent === null)
    expect(gaps.map((w) => w.start)).toEqual([1000, 1050, 1100])
  })

  it('has a GC-rich region and an AT-rich region', () => {
    const gcOfRegion = (start: number, end: number) => gcWindows(sequence.slice(start, end), end - start)[0].gcPercent!
    expect(gcOfRegion(600, 1000)).toBeGreaterThan(60)
    expect(gcOfRegion(1150, 1650)).toBeLessThan(35)
  })
})
