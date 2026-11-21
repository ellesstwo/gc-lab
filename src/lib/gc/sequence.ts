/**
 * DNA sequence input: parsing and validation.
 *
 * Port of the FASTA-reading part of exercise1.py:
 *
 *     with open(FASTA, 'r') as f:
 *         next(f)  # skip FASTA header
 *         whole_genome = ''.join(line.strip() for line in f).lower()
 *
 * Deliberate differences from the original:
 * - Input is pasted text: FASTA (with a ">" header line) or a raw sequence.
 * - The header is kept and used as the analysis name instead of being skipped.
 * - A second ">" record is rejected instead of being silently merged in.
 * - Every character is validated (only A, C, G, T, N) and the length is capped.
 * - Bases are stored uppercase (the usual display convention) instead of lowercase.
 *
 * This file is pure TypeScript: no React and no DeepSpace, so it is easy to test.
 */

/** Largest sequence we accept, in nucleotides. Also enforced by the database schema. */
export const MAX_NUCLEOTIDES = 25_000

/** Longest analysis name we keep from a FASTA header. */
export const MAX_NAME_LENGTH = 100

/** The only characters allowed in a cleaned sequence. */
const VALID_BASES = new Set(['A', 'C', 'G', 'T', 'N'])

/** IUPAC ambiguity codes: real nucleotide notation, but not supported here. */
const AMBIGUITY_CODES = new Set(['R', 'Y', 'S', 'W', 'K', 'M', 'B', 'D', 'H', 'V'])

/**
 * Characters skipped silently: whitespace only (spaces, tabs, line breaks).
 * Digits are NOT skipped: they are reported as errors so the user's data is
 * never changed without them knowing. Numbered (GenBank-style) lines may be
 * supported in a future version.
 */
const IGNORED_CHARACTER = /\s/

export interface ParsedSequence {
  /** Text after ">" on the FASTA header line, or null for a raw sequence. */
  name: string | null
  /** Cleaned sequence: uppercase, only A/C/G/T/N, no whitespace. */
  sequence: string
}

export type ParseErrorCode = 'empty' | 'multiple-records' | 'invalid-character' | 'too-long'

export interface ParseError {
  code: ParseErrorCode
  /** A sentence that can be shown to the user as-is. */
  message: string
  /** 1-based line and column in the pasted text, when the error has a location. */
  line?: number
  column?: number
}

/**
 * Either a parsed sequence or an error, never both.
 * Callers check `result.ok` first, and TypeScript then knows which fields exist.
 */
export type ParseResult =
  | { ok: true; value: ParsedSequence }
  | { ok: false; error: ParseError }

/**
 * Parse pasted text into one validated DNA sequence.
 *
 * Accepts:
 *   >chr1 region          <- optional header (first non-blank line only)
 *   ACGTACGTNN
 *   acgt acgt             <- lowercase and spaces are fine; digits are rejected
 */
export function parseSequenceInput(input: string): ParseResult {
  // Split on any line ending: Windows (\r\n), old Mac (\r) or Unix (\n).
  const lines = input.split(/\r\n|\r|\n/)

  let name: string | null = null
  let sawContent = false // becomes true at the first non-blank line
  const parts: string[] = [] // cleaned sequence, one entry per input line
  let length = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '') continue // blank lines are allowed anywhere

    if (trimmed.startsWith('>')) {
      // A header is only allowed as the very first non-blank line.
      if (sawContent) {
        return fail({
          code: 'multiple-records',
          message:
            `Line ${lineNumber} starts another FASTA record. ` +
            'Paste one sequence at a time.',
          line: lineNumber,
        })
      }
      name = cleanName(trimmed.slice(1))
      sawContent = true
      continue
    }

    sawContent = true

    // Check the line one character at a time so we can report the exact column.
    let cleaned = ''
    for (let col = 0; col < line.length; col++) {
      const char = line[col]
      if (IGNORED_CHARACTER.test(char)) continue

      const base = char.toUpperCase()
      if (!VALID_BASES.has(base)) {
        return fail({
          code: 'invalid-character',
          message: describeInvalidCharacter(char, lineNumber, col + 1),
          line: lineNumber,
          column: col + 1,
        })
      }
      cleaned += base
    }
    parts.push(cleaned)
    length += cleaned.length
  }

  if (length === 0) {
    return fail({
      code: 'empty',
      message:
        name === null
          ? 'Paste a DNA sequence to analyze.'
          : 'The FASTA header has no sequence below it.',
    })
  }

  if (length > MAX_NUCLEOTIDES) {
    return fail({
      code: 'too-long',
      message:
        `This sequence has ${length.toLocaleString('en-US')} nucleotides. ` +
        `The limit is ${MAX_NUCLEOTIDES.toLocaleString('en-US')}; paste a shorter region.`,
    })
  }

  return { ok: true, value: { name, sequence: parts.join('') } }
}

/**
 * Write a name and a cleaned sequence back out as FASTA text: the reverse of
 * parseSequenceInput(). Used to put a saved analysis back into the paste box.
 * Lines are 60 bases long, the common FASTA convention.
 */
export function toFasta(name: string, sequence: string): string {
  const lines: string[] = []
  for (let i = 0; i < sequence.length; i += 60) lines.push(sequence.slice(i, i + 60))
  return `>${name}\n${lines.join('\n')}\n`
}

/**
 * Count the sequence characters in pasted text, for the live counter.
 *
 * Unlike parseSequenceInput(), this works on invalid input too, so the user
 * can see the size of what they pasted even while it has errors. It counts
 * every non-whitespace character on non-header lines; for valid input this
 * equals the number of nucleotides.
 */
export function countSequenceCharacters(input: string): number {
  let count = 0
  for (const line of input.split(/\r\n|\r|\n/)) {
    if (line.trim().startsWith('>')) continue
    for (const char of line) {
      if (!IGNORED_CHARACTER.test(char)) count++
    }
  }
  return count
}

/**
 * Convert a 1-based line and column (as reported in a ParseError) into a
 * 0-based index into the original text. Used to highlight the bad character.
 * Returns null if the position does not exist in the text.
 */
export function lineColumnToIndex(input: string, line: number, column: number): number | null {
  let currentLine = 1
  let lineStart = 0
  for (let i = 0; i <= input.length; i++) {
    const atEnd = i === input.length
    const char = input[i]
    if (atEnd || char === '\n' || char === '\r') {
      if (currentLine === line) {
        const index = lineStart + column - 1
        return column >= 1 && index < i ? index : null
      }
      if (char === '\r' && input[i + 1] === '\n') i++ // \r\n is one line break
      currentLine++
      lineStart = i + 1
    }
  }
  return null
}

function fail(error: ParseError): ParseResult {
  return { ok: false, error }
}

/** Header text -> name: collapse runs of spaces, cap the length, empty becomes null. */
function cleanName(header: string): string | null {
  const name = header.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim()
  return name === '' ? null : name
}

/** A helpful message for each kind of bad character. */
function describeInvalidCharacter(char: string, line: number, column: number): string {
  const where = `Line ${line}, column ${column}`
  const shown = JSON.stringify(char) // quotes it and makes odd characters visible
  const upper = char.toUpperCase()

  if (char >= '0' && char <= '9') {
    return (
      `${where}: found the digit ${shown}. Sequences may only contain A, C, G, T and N; ` +
      'remove position numbers before pasting.'
    )
  }
  if (upper === 'U') {
    return `${where}: found ${shown}. This looks like RNA; replace U with T to analyze it as DNA.`
  }
  if (AMBIGUITY_CODES.has(upper)) {
    return (
      `${where}: found ${shown}, an IUPAC ambiguity code. ` +
      'Only A, C, G, T and N are supported; replace it with N.'
    )
  }
  return `${where}: found ${shown}, which is not a nucleotide. Only A, C, G, T and N are allowed.`
}
