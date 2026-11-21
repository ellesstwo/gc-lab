/**
 * SaveAnalysisPanel: save the current analysis to the database.
 *
 * - Guests see a "Sign in to save" prompt (the server would refuse their
 *   write anyway: the schema gives '*' no create permission).
 * - Signed-in users name the analysis and save it with createConfirmed(),
 *   which waits for the server to store the record (or refuse it) before
 *   the UI says "Saved". New analyses are always private.
 * Saved analyses are listed on the Library page (/library).
 */
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Save } from 'lucide-react'
import { AuthOverlay, useAuthStatus, useMutations } from 'deepspace'

import { Button, Input, Label, useToast } from '@/components/ui'
import { buildAnalysisRecord, cleanAnalysisName, describeSaveError } from '@/lib/gc/analysis-record'
import type { SequenceAnalysis } from '@/lib/gc/gc'
import { MAX_NAME_LENGTH } from '@/lib/gc/sequence'
import { ANALYSES_COLLECTION, type Analysis } from '@/schemas/analyses-schema'

interface SaveAnalysisPanelProps {
  /** Name from the FASTA header, used as the starting name. */
  suggestedName: string | null
  sequence: string
  analysis: SequenceAnalysis
}

export function SaveAnalysisPanel({ suggestedName, sequence, analysis }: SaveAnalysisPanelProps) {
  const { isSignedIn, userId } = useAuthStatus()

  return (
    <section
      aria-labelledby="save-heading"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="save-heading" className="font-semibold">
          Save this analysis
        </h2>
        <p className="text-sm text-muted-foreground">
          Saved analyses are private: only you can see them, unless you share one from your library.
        </p>
      </div>

      {isSignedIn && userId ? (
        <SaveForm suggestedName={suggestedName} sequence={sequence} analysis={analysis} />
      ) : (
        <SignInToSave />
      )}
    </section>
  )
}

function SaveForm({ suggestedName, sequence, analysis }: SaveAnalysisPanelProps) {
  const id = useId()
  const { ready, createConfirmed } = useMutations<Analysis>(ANALYSES_COLLECTION)
  const toast = useToast()

  const [name, setName] = useState(cleanAnalysisName(suggestedName))
  const [saving, setSaving] = useState(false)
  // True when a save has been waiting a while (slow server or dropped connection).
  const [slow, setSlow] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // What was last saved successfully. If nothing has changed since, the
  // button shows "Saved" instead of offering a duplicate save.
  const [savedSignature, setSavedSignature] = useState<string | null>(null)

  const signature = `${cleanAnalysisName(name)}\u0000${analysis.windowSize}\u0000${sequence}`
  const alreadySaved = savedSignature === signature

  async function handleSave() {
    const record = buildAnalysisRecord(name, sequence, analysis)
    setSaving(true)
    setErrorMessage(null)
    const slowTimer = setTimeout(() => setSlow(true), 4000)
    try {
      // Resolves only after the server has stored the record; rejects if the
      // server refuses it (permissions, size limit) or never confirms it.
      await createConfirmed(record)
      setSavedSignature(signature)
      toast.success('Analysis saved', `"${record.name}" is saved privately.`)
    } catch (err) {
      const message = describeSaveError(err)
      setErrorMessage(message)
      toast.error('Analysis not saved', message)
    } finally {
      clearTimeout(slowTimer)
      setSlow(false)
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault() // stay on the page; React handles the save
          void handleSave()
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-name`}>Analysis name</Label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={`${id}-status`}
          />
        </div>
        <Button type="submit" disabled={!ready || saving || alreadySaved} loading={saving}>
          {alreadySaved ? <CheckCircle2 aria-hidden="true" /> : !saving && <Save aria-hidden="true" />}
          {saving ? 'Saving…' : alreadySaved ? 'Saved' : 'Save analysis'}
        </Button>
      </form>

      <div id={`${id}-status`} aria-live="polite" className="text-sm">
        {!ready && <p className="text-muted-foreground">Connecting to the server…</p>}
        {/* Wording matches behavior tested with SDK 0.44.2: after a dropped
            connection the save is re-sent on reconnect (stored once); if the
            server never answers, it fails after about 30 seconds. */}
        {slow && (
          <p className="text-muted-foreground">
            Waiting for the server to confirm this save. If the connection dropped, it is
            sent again after reconnecting. If it still isn’t confirmed, you’ll see an error here.
          </p>
        )}
        {errorMessage && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {errorMessage}
          </p>
        )}
        {alreadySaved && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-success">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            <span>Saved privately.</span>
            <Link to="/library" className="font-medium text-foreground underline underline-offset-4">
              Open your library
            </Link>
            <span className="basis-full text-muted-foreground">
              Change the name or window size to save another version.
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

function SignInToSave() {
  const [showSignIn, setShowSignIn] = useState(false)
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        You can analyze sequences without an account. Sign in to save them.
      </p>
      <Button onClick={() => setShowSignIn(true)}>Sign in to save</Button>
      {showSignIn && (
        <AuthOverlay
          onClose={() => setShowSignIn(false)}
          title="Sign in to save analyses"
          description="Your analyses are saved privately to your account."
        />
      )}
    </div>
  )
}
