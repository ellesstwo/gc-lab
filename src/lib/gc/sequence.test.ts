/**
 * Unit tests for parseSequenceInput() in ./sequence.ts.
 * Run with: npm run test:unit
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_NAME_LENGTH,
  MAX_NUCLEOTIDES,
  countSequenceCharacters,
  lineColumnToIndex,
  parseSequenceInput,
  type ParseResult,
} from './sequence'

/** Assert the parse succeeded and return its value (fails the test otherwise). */
function expectOk(result: ParseResult) {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`)
  return result.value
}

/** Assert the parse failed and return its error (fails the test otherwise). */
function expectError(result: ParseResult) {
  if (result.ok) throw new Error(`Expected an error, got sequence "${result.value.sequence}"`)
  return result.error
}

describe('parseSequenceInput: valid input', () => {
  it('accepts a raw sequence and uppercases it', () => {
    expect(expectOk(parseSequenceInput('acgtn'))).toEqual({ name: null, sequence: 'ACGTN' })
  })

  it('reads a FASTA header as the name and joins the sequence lines', () => {
    const value = expectOk(parseSequenceInput('>chr1 test region\nACGT\nGGCC\n'))
    expect(value).toEqual({ name: 'chr1 test region', sequence: 'ACGTGGCC' })
  })

  it('handles Windows line endings, blank lines and spaces', () => {
    const value = expectOk(parseSequenceInput('\r\n>  my   seq  \r\nAC GT\r\n\r\n\tgg cc\r\n'))
    expect(value).toEqual({ name: 'my seq', sequence: 'ACGTGGCC' })
  })

  it('treats an empty header as no name', () => {
    expect(expectOk(parseSequenceInput('>\nACGT')).name).toBeNull()
  })

  it(`caps the name at ${MAX_NAME_LENGTH} characters`, () => {
    const value = expectOk(parseSequenceInput(`>${'x'.repeat(150)}\nACGT`))
    expect(value.name).toHaveLength(MAX_NAME_LENGTH)
  })

  it('keeps N bases', () => {
    expect(expectOk(parseSequenceInput('NNACGTNN')).sequence).toBe('NNACGTNN')
  })
})

describe('parseSequenceInput: empty input', () => {
  it.each(['', '   ', '\n\n', ' \r\n\t '])('rejects blank input %j', (input) => {
    const error = expectError(parseSequenceInput(input))
    expect(error.code).toBe('empty')
    expect(error.message).toBe('Paste a DNA sequence to analyze.')
  })

  it('rejects a header with no sequence', () => {
    const error = expectError(parseSequenceInput('>lonely header\n\n'))
    expect(error.code).toBe('empty')
    expect(error.message).toBe('The FASTA header has no sequence below it.')
  })
})

describe('parseSequenceInput: invalid input', () => {
  it('rejects a second FASTA record and reports its line', () => {
    const error = expectError(parseSequenceInput('>a\nACGT\n>b\nGGCC'))
    expect(error).toMatchObject({ code: 'multiple-records', line: 3 })
  })

  it('rejects a header that comes after sequence data', () => {
    expect(expectError(parseSequenceInput('ACGT\n>late')).code).toBe('multiple-records')
  })

  it('reports the line and column of the first invalid character', () => {
    const error = expectError(parseSequenceInput('ACGT\nAC-T'))
    expect(error).toMatchObject({ code: 'invalid-character', line: 2, column: 3 })
    expect(error.message).toContain('"-"')
  })

  it('counts columns in the original text, including spaces', () => {
    expect(expectError(parseSequenceInput('AC GX'))).toMatchObject({ line: 1, column: 5 })
  })

  it('rejects digits instead of silently removing them', () => {
    const error = expectError(parseSequenceInput('ACGT5ACGT'))
    expect(error).toMatchObject({ code: 'invalid-character', line: 1, column: 5 })
    expect(error.message).toContain('digit')
  })

  it('rejects GenBank-style numbered lines (not supported yet)', () => {
    expect(expectError(parseSequenceInput('1 acgtacgt')).column).toBe(1)
  })

  it('explains U as RNA', () => {
    expect(expectError(parseSequenceInput('ACGU')).message).toContain('RNA')
  })

  it('explains IUPAC ambiguity codes', () => {
    expect(expectError(parseSequenceInput('ACGR')).message).toContain('ambiguity code')
  })
})

describe(`parseSequenceInput: ${MAX_NUCLEOTIDES.toLocaleString('en-US')}-nucleotide limit`, () => {
  it('accepts exactly the limit', () => {
    const value = expectOk(parseSequenceInput('A'.repeat(MAX_NUCLEOTIDES)))
    expect(value.sequence).toHaveLength(MAX_NUCLEOTIDES)
  })

  it('rejects one nucleotide over the limit and reports the real length', () => {
    const error = expectError(parseSequenceInput('A'.repeat(MAX_NUCLEOTIDES + 1)))
    expect(error.code).toBe('too-long')
    expect(error.message).toContain('25,001')
  })

  it('counts nucleotides, not characters: spaces, line breaks and the header do not count', () => {
    // 25,000 bases spread over 250 lines of 100, with spaces and a header.
    const line = 'ACGTN'.repeat(20).replace(/(.{10})/g, '$1 ') // 100 bases + 10 spaces
    const input = `>long one\n${Array(250).fill(line).join('\n')}`
    expect(expectOk(parseSequenceInput(input)).sequence).toHaveLength(MAX_NUCLEOTIDES)
  })

  it('uses 25,000 as the limit', () => {
    expect(MAX_NUCLEOTIDES).toBe(25_000)
  })
})

describe('countSequenceCharacters (live counter)', () => {
  it('counts nucleotides and ignores the header and whitespace', () => {
    expect(countSequenceCharacters('>header text\nAC GT\r\nnn\n')).toBe(6)
  })

  it('also counts invalid characters, so the counter works while there are errors', () => {
    expect(countSequenceCharacters('ACGT5-X')).toBe(7)
  })

  it('matches the parsed length for valid input', () => {
    const input = '>x\nacgtn acgtn\nGGCC'
    const result = parseSequenceInput(input)
    expect(result.ok && result.value.sequence.length).toBe(countSequenceCharacters(input))
  })

  it('is 0 for blank input', () => {
    expect(countSequenceCharacters(' \n\t')).toBe(0)
  })
})

describe('lineColumnToIndex (highlighting an error)', () => {
  it('finds the character reported by a parse error', () => {
    for (const input of ['ACGT\nAC-T', 'ACGT\r\nAC-T', 'ACGT\rAC-T', '>h\nACGT\nAC-T']) {
      const result = parseSequenceInput(input)
      if (result.ok) throw new Error('expected an error')
      const index = lineColumnToIndex(input, result.error.line!, result.error.column!)
      expect(input[index!]).toBe('-')
    }
  })

  it('works on the first and last character', () => {
    expect(lineColumnToIndex('XCGT', 1, 1)).toBe(0)
    expect(lineColumnToIndex('ACGX', 1, 4)).toBe(3)
  })

  it('returns null for positions that do not exist', () => {
    expect(lineColumnToIndex('ACGT', 2, 1)).toBeNull()
    expect(lineColumnToIndex('ACGT', 1, 5)).toBeNull()
    expect(lineColumnToIndex('ACGT', 1, 0)).toBeNull()
  })
})
