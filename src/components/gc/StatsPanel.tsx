/**
 * StatsPanel: summary numbers for one sequence.
 *
 * Port of the first print block in exercise1.py ("rate of a: ...%"), plus
 * the overall GC content and a composition bar.
 *
 * Two different percentages appear here, on purpose:
 * - GC content uses A+C+G+T as the denominator (N excluded), as decided.
 * - Base composition uses ALL bases (N included), so the parts add up to 100%.
 */
import type { BaseCounts } from '@/lib/gc/gc'
import { BASE_COLORS, BASE_LABEL_INK, BASES } from './chartColors'
import { formatCount, formatPercent } from './format'

interface StatsPanelProps {
  length: number
  counts: BaseCounts
  gcPercent: number | null
}

export function StatsPanel({ length, counts, gcPercent }: StatsPanelProps) {
  const share = (n: number) => (length === 0 ? 0 : (n / length) * 100)
  const acgt = length - counts.N

  return (
    <section aria-labelledby="stats-heading" className="flex flex-col gap-4">
      <h2 id="stats-heading" className="sr-only">
        Sequence statistics
      </h2>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Length" value={`${formatCount(length)} bp`} />
        <StatTile
          label="GC content"
          value={gcPercent === null ? '—' : formatPercent(gcPercent)}
          note={
            gcPercent === null
              ? 'No A, C, G or T bases to measure'
              : `${formatCount(counts.G + counts.C)} G+C of ${formatCount(acgt)} known bases`
          }
        />
        <StatTile
          label="Unknown bases (N)"
          value={formatCount(counts.N)}
          note={`${formatPercent(share(counts.N))} of the sequence`}
        />
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Base composition</h3>

        {/* Segmented bar: one block per base, width = share of all bases. */}
        <div
          role="img"
          aria-label={
            'Base composition: ' +
            BASES.map((b) => `${b} ${formatPercent(share(counts[b]))}`).join(', ')
          }
          className="flex h-7 w-full gap-0.5 overflow-hidden"
        >
          {BASES.filter((b) => counts[b] > 0).map((base) => {
            const pct = share(counts[base])
            return (
              <div
                key={base}
                title={`${base}: ${formatCount(counts[base])} bases (${formatPercent(pct)})`}
                className="flex min-w-0 items-center rounded px-2 text-xs font-medium"
                style={{
                  flexGrow: counts[base],
                  flexBasis: 0,
                  backgroundColor: BASE_COLORS[base],
                  color: BASE_LABEL_INK[base],
                }}
              >
                {/* Only print the label when the block is wide enough for it. */}
                {pct >= 8 && <span aria-hidden="true">{formatPercent(pct)}</span>}
              </div>
            )
          })}
        </div>

        {/* Legend doubles as the full data: every value is readable without hovering. */}
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {BASES.map((base) => (
            <li key={base} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: BASE_COLORS[base] }}
              />
              <span className="font-medium">{base}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatCount(counts[base])} · {formatPercent(share(counts[base]))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  )
}
