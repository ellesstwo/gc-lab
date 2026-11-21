/**
 * SavedAnalysesList: the signed-in user's saved analyses, live from the database.
 *
 * Shown on the analyzer page whenever the user is signed in, so a save can be
 * seen to survive a page reload. useQuery keeps it up to date automatically:
 * a new save or a delete appears here without any refresh code.
 *
 * Step 11 replaces this with the full library page.
 */
import { useState } from 'react'
import { Lock, Trash2, Users } from 'lucide-react'
import { useMutations, useQuery } from 'deepspace'

import { Button, ConfirmModal, useToast } from '@/components/ui'
import { describeSaveError } from '@/lib/gc/analysis-record'
import { ANALYSES_COLLECTION, type Analysis } from '@/schemas/analyses-schema'
import { formatCount, formatPercent } from './format'

const SHOWN = 10

export function SavedAnalysesList({ userId }: { userId: string }) {
  const { records, status, error } = useQuery<Analysis>(ANALYSES_COLLECTION, {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const { ready, removeConfirmed } = useMutations<Analysis>(ANALYSES_COLLECTION)
  const toast = useToast()
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // The server already hides other users' private analyses. Shared ones from
  // other users are filtered out here, because this list is "your saves".
  const mine = records.filter((r) => r.createdBy === userId)

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await removeConfirmed(pendingDelete.id)
      toast.success('Analysis deleted', `"${pendingDelete.name}" was removed.`)
      setPendingDelete(null)
    } catch (err) {
      toast.error('Analysis not deleted', describeSaveError(err, 'delete'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section
      aria-labelledby="saved-heading"
      data-testid="saved-analyses"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <h2 id="saved-heading" className="font-semibold">
        Your saved analyses{status === 'ready' && ` (${formatCount(mine.length)})`}
      </h2>

      {status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
      {status === 'error' && (
        <p className="text-sm text-destructive">Could not load saved analyses: {error}</p>
      )}
      {status === 'ready' && mine.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. Analyze a sequence above and press “Save analysis”.
        </p>
      )}

      {mine.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60 text-sm">
          {mine.slice(0, SHOWN).map((r) => (
            <li key={r.recordId} data-testid="saved-analysis" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">{r.data.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatCount(r.data.length)} bp ·{' '}
                {r.data.gcPercent === null ? 'no GC' : `${formatPercent(r.data.gcPercent)} GC`}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {r.data.visibility === 'shared' ? (
                  <Users aria-hidden="true" className="size-3" />
                ) : (
                  <Lock aria-hidden="true" className="size-3" />
                )}
                {r.data.visibility === 'shared' ? 'Shared' : 'Private'}
              </span>
              <time dateTime={r.createdAt} className="text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()}
              </time>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={!ready}
                aria-label={`Delete ${r.data.name}`}
                onClick={() => setPendingDelete({ id: r.recordId, name: r.data.name })}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {mine.length > SHOWN && (
        <p className="text-xs text-muted-foreground">
          Showing the {SHOWN} most recent. The full library is coming in the next step.
        </p>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this analysis?"
        description={pendingDelete ? `"${pendingDelete.name}" will be permanently deleted.` : undefined}
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
      />
    </section>
  )
}
