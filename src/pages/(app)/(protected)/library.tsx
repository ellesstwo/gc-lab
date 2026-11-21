/**
 * Library (/library). Signed-in users only: this file lives under (protected)/.
 *
 * Real time with no extra code: useQuery subscribes to the `analyses`
 * collection over the WebSocket. When anyone saves, shares, un-shares or
 * deletes an analysis, the server checks who may see it and pushes the
 * change only to those users, and this page re-renders.
 *
 * What arrives is already filtered by the server (permissions): your own
 * analyses, plus other people's analyses whose visibility is 'shared'.
 * Others' private analyses never reach this browser.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Users } from 'lucide-react'
import { useAuthStatus, useMutations, useQuery, useUserLookup } from 'deepspace'

import { AnalysisCard } from '@/components/gc/AnalysisCard'
import { formatCount } from '@/components/gc/format'
import { buttonVariants, ConfirmModal, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from '@/components/ui'
import { describeSaveError } from '@/lib/gc/analysis-record'
import { ANALYSES_COLLECTION, type Analysis } from '@/schemas/analyses-schema'

export default function LibraryPage() {
  const { userId } = useAuthStatus()
  const { records, status, error } = useQuery<Analysis>(ANALYSES_COLLECTION, {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const { getName } = useUserLookup() // display names only (no emails)
  const { removeConfirmed } = useMutations<Analysis>(ANALYSES_COLLECTION)
  const toast = useToast()
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const mine = records.filter((r) => r.createdBy === userId)
  // The server only sends others' records when they are shared; checking
  // visibility here as well keeps the tab correct during an update.
  const sharedByOthers = records.filter((r) => r.createdBy !== userId && r.data.visibility === 'shared')

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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 text-foreground sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-muted-foreground">
            Your saved analyses, and analyses other people have shared. Updates appear live.
          </p>
        </div>
        <Link to="/home" className={buttonVariants({ variant: 'outline' })}>
          <FlaskConical aria-hidden="true" />
          New analysis
        </Link>
      </header>

      {status === 'error' && (
        <p role="alert" className="text-destructive">
          Could not load the library: {error}
        </p>
      )}

      <Tabs defaultValue="mine" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="mine">
            My analyses{status === 'ready' && ` (${formatCount(mine.length)})`}
          </TabsTrigger>
          <TabsTrigger value="shared">
            Shared by others{status === 'ready' && ` (${formatCount(sharedByOthers.length)})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine">
          {status === 'loading' ? (
            <Loading />
          ) : mine.length === 0 ? (
            <Empty
              title="No saved analyses yet"
              text="Analyze a sequence and press “Save analysis”. It will appear here, private to you."
              action={<Link to="/home" className="font-medium underline underline-offset-4">Go to the analyzer</Link>}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="My analyses">
              {mine.map((r) => (
                <AnalysisCard
                  key={r.recordId}
                  record={r}
                  isOwner
                  ownerName={null}
                  onDelete={() => setPendingDelete({ id: r.recordId, name: r.data.name })}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="shared">
          {status === 'loading' ? (
            <Loading />
          ) : sharedByOthers.length === 0 ? (
            <Empty
              title="Nothing shared yet"
              text="When another user shares an analysis, it appears here immediately, without refreshing."
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Shared by others">
              {sharedByOthers.map((r) => (
                <AnalysisCard
                  key={r.recordId}
                  record={r}
                  isOwner={false}
                  ownerName={getName(r.createdBy)}
                  onDelete={() => {}}
                />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

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
    </main>
  )
}

function Loading() {
  return <p className="py-8 text-center text-muted-foreground">Loading…</p>
}

function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <Users aria-hidden="true" className="size-7 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}
