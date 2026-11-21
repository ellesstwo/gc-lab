/**
 * Analyses collection: one saved GC analysis per record.
 *
 * Everything here is enforced by the server (the app's Durable Object),
 * not just the browser:
 * - maxLength on `sequence` (25,000) and `name` (100): longer writes are refused.
 * - required / immutable columns: a saved sequence and its stats can never be
 *   edited afterwards, so they always describe the same data.
 * - permissions: guests cannot read or create anything; signed-in users read
 *   their own analyses plus ones shared with everyone, and change only their own.
 * - visibility defaults to 'private'. Only the exact value 'shared' makes a
 *   record visible to other users; any other value stays private (fails closed).
 */
import type { CollectionSchema } from 'deepspace/schema'

import { MAX_NAME_LENGTH, MAX_NUCLEOTIDES } from '../lib/gc/sequence'

export const ANALYSES_COLLECTION = 'analyses'

export type Visibility = 'private' | 'shared'

/** The fields of one saved analysis (what `useQuery` returns under `.data`). */
export interface Analysis {
  name: string
  /** Cleaned sequence: uppercase A/C/G/T/N only. */
  sequence: string
  length: number
  /** Overall GC% of A/C/G/T bases; null if the sequence is all N. */
  gcPercent: number | null
  countA: number
  countC: number
  countG: number
  countT: number
  countN: number
  /** Window size the user chose when saving (the chart reopens with it). */
  windowSize: number
  visibility: Visibility
}

/** Columns a client may write. Anything else in a write is refused. */
const WRITABLE_FIELDS: (keyof Analysis)[] = [
  'name',
  'sequence',
  'length',
  'gcPercent',
  'countA',
  'countC',
  'countG',
  'countT',
  'countN',
  'windowSize',
  'visibility',
]

const NONE = { read: false, create: false, update: false, delete: false } as const

export const analysesSchema: CollectionSchema = {
  name: ANALYSES_COLLECTION,
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: MAX_NAME_LENGTH },
    {
      name: 'sequence',
      storage: 'text',
      interpretation: 'plain',
      required: true,
      immutable: true,
      maxLength: MAX_NUCLEOTIDES,
    },
    { name: 'length', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    // Not `required`: an all-N sequence has no GC% (null).
    { name: 'gcPercent', storage: 'number', interpretation: 'plain', immutable: true },
    { name: 'countA', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    { name: 'countC', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    { name: 'countG', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    { name: 'countT', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    { name: 'countN', storage: 'number', interpretation: 'plain', required: true, immutable: true },
    { name: 'windowSize', storage: 'number', interpretation: 'plain', required: true },
    {
      name: 'visibility',
      storage: 'text',
      interpretation: { kind: 'select', options: ['private', 'shared'] },
      required: true,
      default: 'private',
    },
  ],
  // `read: 'published'` = the owner, OR anyone when visibility === 'shared'.
  visibilityField: { field: 'visibility', value: 'shared' },
  permissions: {
    '*': NONE, // signed-out guests: no access at all
    viewer: NONE, // read-only role (only if an admin demotes someone)
    member: {
      read: 'published',
      create: true,
      update: 'own',
      delete: 'own',
      writableFields: WRITABLE_FIELDS,
    },
    admin: {
      read: 'published', // admins cannot read others' private analyses either
      create: true,
      update: 'own',
      delete: true, // moderation: may remove any analysis they can see
      writableFields: WRITABLE_FIELDS,
    },
  },
}
