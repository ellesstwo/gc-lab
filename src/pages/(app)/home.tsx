/* home pattern: product-preview-first — the analyzer itself is the home page; guests use it fully, saving needs sign-in */

/**
 * Analyzer page (/home). Public: guests can use it without signing in.
 *
 * Data flow (all on this page, in the browser):
 *
 *   text (state) ──parseSequenceInput──► result ──analyzeSequence──► analysis
 *                                                    ▲                 │
 *   windowSize (state) ──────────────────────────────┘                 ▼
 *                       StatsPanel, GcChart, GcDataTable, SaveAnalysisPanel
 *
 * Saving talks to the database (the `analyses` collection); saved analyses
 * are listed on the Library page (/library).
 */

import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BarChart3, FolderOpen } from 'lucide-react'

import { GcChart } from '@/components/gc/GcChart'
import { GcDataTable } from '@/components/gc/GcDataTable'
import { SaveAnalysisPanel } from '@/components/gc/SaveAnalysisPanel'
import { SequenceInput } from '@/components/gc/SequenceInput'
import { StatsPanel } from '@/components/gc/StatsPanel'
import { WindowSizeControl } from '@/components/gc/WindowSizeControl'
import { formatCount } from '@/components/gc/format'
import { analyzeSequence } from '@/lib/gc/gc'
import { readOpenAnalysis } from '@/lib/gc/open-analysis'
import { parseSequenceInput, toFasta } from '@/lib/gc/sequence'

export default function HomePage() {
  // An analysis opened from the library (or null on a normal visit).
  // See src/lib/gc/open-analysis.ts.
  const location = useLocation()
  const opened = readOpenAnalysis(location.state)

  // State: the only two things the user controls. The functions passed to
  // useState run once, on first render: an opened analysis becomes the
  // starting text and window size, and from then on the user edits freely.
  const [text, setText] = useState(() => (opened ? toFasta(opened.name, opened.sequence) : ''))
  const [windowSize, setWindowSize] = useState<number | null>(() => opened?.windowSize ?? null) // null = default

  // Derived: recomputed only when their inputs change.
  const result = useMemo(() => parseSequenceInput(text), [text])
  // null while the input is empty or invalid.
  const current = useMemo(
    () =>
      result.ok
        ? { parsed: result.value, analysis: analyzeSequence(result.value.sequence, windowSize) }
        : null,
    [result, windowSize],
  )
  const analysis = current?.analysis ?? null

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 text-foreground sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">GC content analyzer</h1>
        <p className="text-muted-foreground">
          Paste a DNA sequence to measure its GC content along its length.
        </p>
      </header>

      {opened && (
        <p
          data-testid="opened-from-library"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-sm"
        >
          <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span>
            Opened <span className="font-medium">“{opened.name}”</span> from the library
            {opened.sharedBy && <> (shared by {opened.sharedBy})</>}.
          </span>
          <span className="text-muted-foreground">
            Changes here don’t alter the saved analysis; saving creates a new copy.
          </span>
        </p>
      )}

      <SequenceInput value={text} onChange={setText} result={result} />

      {current && analysis ? (
        <>
          <StatsPanel length={analysis.length} counts={analysis.counts} gcPercent={analysis.gcPercent} />

          <section aria-labelledby="chart-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="chart-heading" className="font-semibold">GC content along the sequence</h2>
                <p className="text-sm text-muted-foreground">
                  {formatCount(analysis.windowSize)} bp windows, side by side. Shaded areas are
                  windows that are 80% N or more.
                </p>
              </div>
              <WindowSizeControl
                key={analysis.windowSize}
                value={analysis.windowSize}
                defaultValue={analysis.defaultWindowSize}
                limits={analysis.windowSizeLimits}
                windowCount={analysis.windows.length}
                onChange={setWindowSize}
              />
            </div>

            <GcChart
              windows={analysis.windows}
              windowSize={analysis.windowSize}
              sequenceLength={analysis.length}
              meanGc={analysis.gcPercent}
            />
            <GcDataTable windows={analysis.windows} />
          </section>

          {/* key: a new FASTA header resets the name box to that header */}
          <SaveAnalysisPanel
            key={current.parsed.name ?? ''}
            suggestedName={current.parsed.name}
            sequence={current.parsed.sequence}
            analysis={analysis}
          />
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <BarChart3 aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="font-medium">Results appear here</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {text.trim() === ''
              ? 'Paste a sequence above, or load the example to see how it works.'
              : 'Fix the problem shown above to see the results.'}
          </p>
        </div>
      )}
    </main>
  )
}
