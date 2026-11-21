/**
 * Unit tests for ./analysis-record.ts and the analyses schema rules.
 */
import { describe, expect, it } from 'vitest'

import { analysesSchema } from '@/schemas/analyses-schema'
import { buildAnalysisRecord, cleanAnalysisName, DEFAULT_ANALYSIS_NAME, describeSaveError } from './analysis-record'
import { analyzeSequence } from './gc'
import { MAX_NAME_LENGTH, MAX_NUCLEOTIDES } from './sequence'

describe('buildAnalysisRecord', () => {
  const sequence = 'GCGCGATATAT'
  const record = buildAnalysisRecord('  my   region ', sequence, analyzeSequence(sequence, 5))

  it('stores the sequence and the numbers from analyzeSequence', () => {
    expect(record).toEqual({
      name: 'my region',
      sequence,
      length: 11,
      gcPercent: (5 / 11) * 100,
      countA: 3,
      countC: 2,
      countG: 3,
      countT: 3,
      countN: 0,
      windowSize: 5,
      visibility: 'private',
    })
  })

  it('is always private when first saved', () => {
    expect(record.visibility).toBe('private')
  })

  it('stores null GC for an all-N sequence', () => {
    expect(buildAnalysisRecord('x', 'NNNNN', analyzeSequence('NNNNN')).gcPercent).toBeNull()
  })
})

describe('cleanAnalysisName', () => {
  it.each([null, undefined, '', '   '])('uses the default for %j', (name) => {
    expect(cleanAnalysisName(name)).toBe(DEFAULT_ANALYSIS_NAME)
  })

  it(`caps names at ${MAX_NAME_LENGTH} characters`, () => {
    expect(cleanAnalysisName('x'.repeat(300))).toHaveLength(MAX_NAME_LENGTH)
  })
})

describe('describeSaveError', () => {
  it('explains SDK error codes', () => {
    expect(describeSaveError(Object.assign(new Error('x'), { code: 'not_ready' }))).toMatch(/nothing was sent/)
    expect(describeSaveError(Object.assign(new Error('x'), { code: 'cancelled' }))).toMatch(/Nothing was changed/)
  })

  it('never tells the user to simply retry when the outcome is unknown (could duplicate)', () => {
    const unconfirmed = describeSaveError(Object.assign(new Error('x'), { code: 'unconfirmed' }))
    expect(unconfirmed).toMatch(/did not confirm/)
    expect(unconfirmed).toMatch(/may or may not have been stored/)
    expect(unconfirmed).toMatch(/before saving again/)
  })

  it('handles the disconnect errors described in the DeepSpace docs', () => {
    expect(describeSaveError(new Error('WebSocket disconnected'))).toMatch(/connection dropped.*may or may not/)
    expect(describeSaveError(new Error('WebSocket not connected'))).toMatch(/nothing was sent/)
  })

  it('explains server refusals', () => {
    expect(describeSaveError(new Error('CREATE DENIED: role=viewer, collection=analyses'))).toMatch(/permission/)
    expect(describeSaveError(new Error("Field 'sequence' must be text of at most 25000 characters"))).toMatch(
      /refused the save: Field 'sequence'/,
    )
  })

  it('names the action that failed', () => {
    expect(describeSaveError(new Error('UPDATE DENIED: role=member'), 'delete')).toMatch(/permission to delete/)
    expect(describeSaveError(undefined, 'delete')).toBe('Could not delete. Please try again.')
  })

  it('never returns an empty message', () => {
    expect(describeSaveError(undefined)).toBe('Could not save. Please try again.')
  })
})

describe('analyses schema (server-enforced rules)', () => {
  const column = (name: string) => analysesSchema.columns.find((c) => c.name === name)!

  it(`limits sequences to ${MAX_NUCLEOTIDES.toLocaleString('en-US')} characters`, () => {
    expect(column('sequence').maxLength).toBe(25_000)
  })

  it('makes new analyses private by default', () => {
    expect(column('visibility').default).toBe('private')
    expect(analysesSchema.visibilityField).toEqual({ field: 'visibility', value: 'shared' })
  })

  it('gives signed-out guests no access at all', () => {
    const none = { read: false, create: false, update: false, delete: false }
    expect(analysesSchema.permissions['*']).toEqual(none)
    // Signed-out browsers actually connect with the role 'viewer' (seen in
    // the smoke test), so 'viewer' must be closed too. Opening it would
    // open the collection to every guest.
    expect(analysesSchema.permissions.viewer).toEqual(none)
  })

  it('lets members create, see own + shared, and change only their own', () => {
    expect(analysesSchema.permissions.member).toMatchObject({
      read: 'published',
      create: true,
      update: 'own',
      delete: 'own',
    })
  })

  it('never lets saved sequences or their stats be edited', () => {
    for (const name of ['sequence', 'length', 'gcPercent', 'countA', 'countC', 'countG', 'countT', 'countN']) {
      expect(column(name).immutable).toBe(true)
    }
  })

  it('accepts every field buildAnalysisRecord produces, and nothing else', () => {
    const record = buildAnalysisRecord('x', 'ACGT', analyzeSequence('ACGT'))
    expect([...analysesSchema.permissions.member.writableFields!].sort()).toEqual(Object.keys(record).sort())
  })
})
