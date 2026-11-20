/**
 * GcDataTable: every window's numbers, as a table.
 *
 * The chart's twin: the same data readable without a mouse, by a screen
 * reader, or for checking values by hand. Collapsed by default.
 */
import type { GcWindow } from '@/lib/gc/gc'
import { formatCount, formatPercent, formatRange } from './format'

export function GcDataTable({ windows }: { windows: GcWindow[] }) {
  return (
    <details className="group rounded-lg border border-border">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none hover:bg-accent/50">
        Show data table ({formatCount(windows.length)} {windows.length === 1 ? 'window' : 'windows'})
      </summary>
      <div className="max-h-80 overflow-auto border-t border-border">
        <table className="w-full text-sm tabular-nums">
          <thead className="sticky top-0 bg-card text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Window</th>
              <th scope="col" className="px-4 py-2 font-medium">Bases</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">GC</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">N</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w, i) => (
              <tr key={w.start} className="border-t border-border/50">
                <td className="px-4 py-1.5">{formatCount(i + 1)}</td>
                <td className="px-4 py-1.5">{formatRange(w.start, w.end)}</td>
                <td className="px-4 py-1.5 text-right">
                  {w.gcPercent === null ? <span className="text-muted-foreground">gap</span> : formatPercent(w.gcPercent)}
                </td>
                <td className="px-4 py-1.5 text-right text-muted-foreground">
                  {formatPercent(w.nFraction * 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
