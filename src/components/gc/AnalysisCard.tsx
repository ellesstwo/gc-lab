/**
 * AnalysisCard: one saved analysis in the library.
 *
 * Everyone gets "Open in analyzer".
 * Owners also get a Private/Shared switch and a delete button. Other users'
 * shared analyses show who shared them and nothing editable (the server
 * would refuse their changes anyway: update/delete are 'own').
 */
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartLine, Lock, Trash2, Users } from 'lucide-react'
import { useMutations, type RecordData } from 'deepspace'

import { Button, buttonVariants, Label, Switch, useToast } from '@/components/ui'
import { describeSaveError } from '@/lib/gc/analysis-record'
import type { OpenAnalysis } from '@/lib/gc/open-analysis'
import { ANALYSES_COLLECTION, type Analysis, type Visibility } from '@/schemas/analyses-schema'
import { formatCount, formatPercent } from './format'

interface AnalysisCardProps {
  record: RecordData<Analysis>
  isOwner: boolean
  /** Display name of the owner (shown on other people's shared analyses). */
  ownerName: string | null
  onDelete: () => void
}

export function AnalysisCard({ record, isOwner, ownerName, onDelete }: AnalysisCardProps) {
  const { data } = record
  const shared = data.visibility === 'shared'

  return (
    <li
      data-testid="analysis-card"
      data-record-id={record.recordId}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 className="min-w-0 flex-1 truncate font-medium">{data.name}</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {shared ? <Users aria-hidden="true" className="size-3" /> : <Lock aria-hidden="true" className="size-3" />}
          {shared ? 'Shared' : 'Private'}
        </span>
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Fact label="Length" value={`${formatCount(data.length)} bp`} />
        <Fact label="GC" value={data.gcPercent === null ? '—' : formatPercent(data.gcPercent)} />
        <Fact label="N" value={formatCount(data.countN)} />
        <Fact label="Window" value={`${formatCount(data.windowSize)} bp`} />
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="text-xs text-muted-foreground">
          {!isOwner && <>Shared by {ownerName ?? 'another user'} · </>}
          <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <VisibilitySwitch recordId={record.recordId} name={data.name} visibility={data.visibility} />
          )}
          {/* Reopen in the analyzer: the saved data travels with the navigation
              (see src/lib/gc/open-analysis.ts). Works for own and shared analyses. */}
          <Link
            to="/home"
            state={{
              openAnalysis: {
                name: data.name,
                sequence: data.sequence,
                windowSize: data.windowSize,
                sharedBy: isOwner ? null : (ownerName ?? 'another user'),
              } satisfies OpenAnalysis,
            }}
            aria-label={`Open ${data.name} in the analyzer`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ChartLine aria-hidden="true" />
            Open in analyzer
          </Link>
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Delete ${data.name}`}
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * The Private/Shared switch. It shows the requested state while the server
 * confirms (putConfirmed), then the card re-renders from the record the
 * server broadcast. If the server refuses, the switch falls back to the
 * stored value and the user is told why.
 */
function VisibilitySwitch({ recordId, name, visibility }: { recordId: string; name: string; visibility: Visibility }) {
  const id = useId()
  const toast = useToast()
  const { ready, putConfirmed } = useMutations<Analysis>(ANALYSES_COLLECTION)
  const [pending, setPending] = useState<Visibility | null>(null)

  const shown = pending ?? visibility

  async function change(next: Visibility) {
    setPending(next)
    try {
      await putConfirmed(recordId, { visibility: next }) // send only the changed field
      toast.success(
        next === 'shared' ? 'Analysis shared' : 'Analysis is private again',
        next === 'shared'
          ? `"${name}" is now visible to every signed-in user.`
          : `"${name}" is visible only to you.`,
      )
    } catch (err) {
      toast.error('Visibility not changed', describeSaveError(err, 'save'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`${id}-shared`}
        checked={shown === 'shared'}
        disabled={!ready || pending !== null}
        onCheckedChange={(checked) => void change(checked ? 'shared' : 'private')}
        aria-describedby={`${id}-hint`}
      />
      <Label htmlFor={`${id}-shared`} className="text-sm font-normal">
        {pending ? 'Saving…' : 'Share with everyone'}
      </Label>
      <span id={`${id}-hint`} className="sr-only">
        {shown === 'shared'
          ? 'Shared: every signed-in user can see this analysis.'
          : 'Private: only you can see this analysis.'}
      </span>
    </div>
  )
}
