/**
 * GcSparkline: a small, non-interactive GC chart for the landing page.
 *
 * Unlike GcChart it needs no browser measurements: the SVG uses a fixed
 * coordinate system (viewBox) and stretches to fit its box, so it can be
 * pre-rendered to plain HTML at build time. Gaps (windows >= 80% N) are
 * shaded and break the line, the same way as in the full chart.
 */
import type { GcWindow } from '@/lib/gc/gc'
import { GC_LINE_COLOR } from './chartColors'

const W = 600
const H = 160

export function GcSparkline({ windows, sequenceLength }: { windows: GcWindow[]; sequenceLength: number }) {
  const x = (position: number) => (position / sequenceLength) * W
  const y = (gc: number) => H - (gc / 100) * H

  // "M" starts a new line segment after each gap; "L" continues it.
  let path = ''
  windows.forEach((w, i) => {
    if (w.gcPercent === null) return
    const continues = i > 0 && windows[i - 1].gcPercent !== null
    path += `${continues ? 'L' : 'M'}${x((w.start + w.end) / 2).toFixed(1)},${y(w.gcPercent).toFixed(1)}`
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="block h-40 w-full">
      {[25, 50, 75].map((gc) => (
        <line key={gc} x1={0} x2={W} y1={y(gc)} y2={y(gc)} className="stroke-border" vectorEffect="non-scaling-stroke" />
      ))}
      {windows.map((w) =>
        w.gcPercent === null ? (
          <rect
            key={w.start}
            x={x(w.start)}
            y={0}
            width={x(w.end) - x(w.start)}
            height={H}
            className="fill-muted-foreground"
            fillOpacity={0.14}
          />
        ) : null,
      )}
      <path
        d={path}
        fill="none"
        stroke={GC_LINE_COLOR}
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
