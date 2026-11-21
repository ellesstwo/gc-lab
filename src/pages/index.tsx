/**
 * Landing page (/), a STATIC page.
 *
 * It lives at the top level of src/pages/ (not under (app)/), so it renders
 * with no DeepSpace providers: no sign-in check, no database connection.
 * It is pre-rendered to HTML at build time (prerender.ts), so it must render
 * without a browser. The chart preview is computed here from the synthetic
 * example by the same tested functions the analyzer uses.
 */

import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

import { GcLabMark } from '../components/GcLabMark'
import { Seo } from '../components/Seo'
import { GcSparkline } from '../components/gc/GcSparkline'
import { formatCount, formatPercent } from '../components/gc/format'
import { buttonVariants } from '../components/ui'
import { APP_TITLE } from '../constants'
import { EXAMPLE_FASTA } from '../lib/gc/example'
import { analyzeSequence } from '../lib/gc/gc'
import { parseSequenceInput } from '../lib/gc/sequence'
import { seo } from '../seo'

// Computed once, at build time and in the browser alike (deterministic).
const parsedExample = parseSequenceInput(EXAMPLE_FASTA)
const example = parsedExample.ok ? analyzeSequence(parsedExample.value.sequence) : null

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <GcLabMark className="size-7" />
            {APP_TITLE}
          </span>
          <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">
            Open the analyzer
          </Link>
        </header>

        <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.1fr_1fr]">
          <section className="flex flex-col gap-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Computational genomics</p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              See where a DNA sequence is GC-rich.
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              Paste a sequence or a FASTA record and GC Lab measures its GC content window by
              window. Unknown regions show as gaps, not guesses.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/home" className={buttonVariants({ size: 'lg' })}>
                Open the analyzer
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/library" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
                Your library
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
              <li>Up to 25,000 bp</li>
              <li>Raw or FASTA input</li>
              <li>Saved privately by default</li>
            </ul>
          </section>

          {example && (
            <figure className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <figcaption className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Example: synthetic {formatCount(example.length)} bp sequence
                </span>
                <span className="font-mono text-sm">
                  {example.gcPercent === null ? '—' : formatPercent(example.gcPercent)} GC
                </span>
              </figcaption>
              <GcSparkline windows={example.windows} sequenceLength={example.length} />
              <p className="font-mono text-xs text-muted-foreground">
                {formatCount(example.windowSize)} bp windows · shaded = 80% or more N
              </p>
            </figure>
          )}
        </main>

        <footer className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          GC content = (G + C) / (A + C + G + T). Built on the DeepSpace SDK.
        </footer>
      </div>
    </>
  )
}
