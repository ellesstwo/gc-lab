/**
 * GcChart: GC content along the sequence, one point per window.
 *
 * Replaces the matplotlib plot in exercise1.py:
 *   pd.DataFrame(summary, columns=['GC', 'AT'], index=positions).plot(...)
 * (AT is not plotted: without N it is just 100 - GC.)
 *
 * Drawn as plain SVG, no chart library:
 * - x axis: position in the sequence (bp); y axis: GC% from 0 to 100, fixed,
 *   so charts of different sequences are directly comparable.
 * - Each window is plotted at its midpoint and joined by a line.
 * - Windows that are >= 80% N have gcPercent null: the line breaks there and
 *   a shaded "N" band shows why.
 * - A hairline marks the sequence's overall GC%.
 * - Hover (or focus + arrow keys) shows the exact window under the pointer.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import type { GcWindow } from '@/lib/gc/gc'
import { GC_LINE_COLOR } from './chartColors'
import { formatCount, formatPercent, formatRange } from './format'

interface GcChartProps {
  windows: GcWindow[]
  windowSize: number
  sequenceLength: number
  /** Overall GC% of the sequence, drawn as a reference line. */
  meanGc: number | null
}

const HEIGHT = 300
const MARGIN = { top: 16, right: 16, bottom: 44, left: 48 }
const Y_TICKS = [0, 25, 50, 75, 100]

export function GcChart({ windows, windowSize, sequenceLength, meanGc }: GcChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  // Index of the window under the pointer / keyboard cursor, or null.
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  // If the windows change (new sequence or window size), an old index may no
  // longer exist; treat it as "nothing active" instead of crashing.
  const active = activeIndex !== null && activeIndex < windows.length ? activeIndex : null
  const activeWindow = active === null ? null : windows[active]

  // ---- Scales: data values -> pixel positions ------------------------------
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const xOf = (position: number) => MARGIN.left + (position / sequenceLength) * plotWidth
  const yOf = (gc: number) => MARGIN.top + (1 - gc / 100) * plotHeight
  const midpoint = (w: GcWindow) => (w.start + w.end) / 2

  const { path, isolatedPoints } = buildLine(windows, (w) => xOf(midpoint(w)), yOf)
  const gapBands = mergeGaps(windows)
  const xTicks = niceTicks(sequenceLength, Math.max(2, Math.floor(plotWidth / 90)))

  // ---- Interaction -----------------------------------------------------------
  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - rect.left - MARGIN.left
    if (px < 0 || px > plotWidth) return setActiveIndex(null)
    const position = (px / plotWidth) * sequenceLength
    setActiveIndex(Math.min(Math.floor(position / windowSize), windows.length - 1))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = windows.length - 1
    const current = active ?? 0
    const next: Record<string, number | null> = {
      ArrowRight: Math.min(current + 1, last),
      ArrowLeft: Math.max(current - 1, 0),
      Home: 0,
      End: last,
      Escape: null,
    }
    if (!(event.key in next)) return
    event.preventDefault()
    setActiveIndex(next[event.key])
  }

  // ---- Tooltip position: right of the crosshair, flipped near the right edge
  const activeX = activeWindow ? xOf(midpoint(activeWindow)) : 0
  const flipTooltip = activeX > width - 200

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        tabIndex={0}
        role="group"
        aria-label="GC content chart. Use the left and right arrow keys to read each window."
        onKeyDown={handleKeyDown}
        onFocus={() => setActiveIndex((i) => i ?? 0)}
        onBlur={() => setActiveIndex(null)}
        className="relative w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ height: HEIGHT }}
      >
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            aria-hidden="true"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActiveIndex(null)}
            className="block touch-none select-none"
          >
            {/* Horizontal gridlines and y-axis labels */}
            {Y_TICKS.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotWidth}
                  y1={yOf(tick)}
                  y2={yOf(tick)}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={MARGIN.left - 8}
                  y={yOf(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-xs tabular-nums"
                >
                  {tick}%
                </text>
              </g>
            ))}

            {/* Shaded bands where windows are >= 80% N */}
            {gapBands.map(({ start, end }) => {
              const x1 = xOf(start)
              const bandWidth = xOf(end) - x1
              return (
                <g key={start}>
                  <rect
                    x={x1}
                    y={MARGIN.top}
                    width={bandWidth}
                    height={plotHeight}
                    className="fill-muted-foreground"
                    fillOpacity={0.12}
                  />
                  {bandWidth >= 16 && (
                    <text
                      x={x1 + bandWidth / 2}
                      y={MARGIN.top + 14}
                      textAnchor="middle"
                      className="fill-muted-foreground text-xs font-medium"
                    >
                      N
                    </text>
                  )}
                </g>
              )
            })}

            {/* X axis: baseline, ticks and title */}
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={MARGIN.top + plotHeight}
              y2={MARGIN.top + plotHeight}
              className="stroke-muted-foreground/50"
              strokeWidth={1}
            />
            {xTicks.map((tick) => (
              <text
                key={tick}
                x={xOf(tick)}
                y={MARGIN.top + plotHeight + 18}
                // The rightmost label is right-aligned so it never runs off the edge.
                textAnchor={xOf(tick) > MARGIN.left + plotWidth - 24 ? 'end' : 'middle'}
                className="fill-muted-foreground text-xs tabular-nums"
              >
                {formatCount(tick)}
              </text>
            ))}
            <text
              x={MARGIN.left + plotWidth / 2}
              y={HEIGHT - 4}
              textAnchor="middle"
              className="fill-muted-foreground text-xs"
            >
              Position (bp)
            </text>

            {/* Overall GC% reference line with a direct label */}
            {meanGc !== null && (
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={yOf(meanGc)}
                y2={yOf(meanGc)}
                className="stroke-foreground/40"
                strokeWidth={1}
              />
            )}

            {/* The GC line itself */}
            <path
              d={path}
              fill="none"
              stroke={GC_LINE_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* A window between two gaps has no neighbor to join: draw it as a dot */}
            {isolatedPoints.map((p) => (
              <circle key={p.x} cx={p.x} cy={p.y} r={4} fill={GC_LINE_COLOR} className="stroke-card" strokeWidth={2} />
            ))}

            {/* Reference-line label, drawn after the data so it sits on top. The
                card-colored outline ("halo") keeps it readable where the line crosses it. */}
            {meanGc !== null && (
              <text
                x={MARGIN.left + plotWidth - 4}
                y={yOf(meanGc) + (meanGc > 85 ? 14 : -6)}
                textAnchor="end"
                className="fill-foreground stroke-card text-xs font-medium"
                strokeWidth={4}
                strokeLinejoin="round"
                style={{ paintOrder: 'stroke' }}
              >
                overall {formatPercent(meanGc)}
              </text>
            )}

            {/* Crosshair and marker for the active window */}
            {activeWindow && (
              <g>
                <line
                  x1={activeX}
                  x2={activeX}
                  y1={MARGIN.top}
                  y2={MARGIN.top + plotHeight}
                  className="stroke-foreground/50"
                  strokeWidth={1}
                />
                {activeWindow.gcPercent !== null && (
                  <circle
                    cx={activeX}
                    cy={yOf(activeWindow.gcPercent)}
                    r={5}
                    fill={GC_LINE_COLOR}
                    className="stroke-card"
                    strokeWidth={2}
                  />
                )}
              </g>
            )}
          </svg>
        )}

        {/* Tooltip (HTML on top of the SVG): value first, details after */}
        {activeWindow && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 w-max max-w-48 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
            style={{
              top: MARGIN.top,
              left: flipTooltip ? activeX - 12 : activeX + 12,
              transform: flipTooltip ? 'translateX(-100%)' : undefined,
            }}
          >
            <TooltipBody window={activeWindow} index={active!} total={windows.length} />
          </div>
        )}
      </div>

      {/* Screen readers hear the active window when it changes */}
      <p aria-live="polite" className="sr-only">
        {activeWindow ? describeWindow(activeWindow, active!, windows.length) : ''}
      </p>
    </div>
  )
}

function TooltipBody({ window: w, index, total }: { window: GcWindow; index: number; total: number }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-base font-semibold tabular-nums">
        {w.gcPercent === null ? 'No data' : formatPercent(w.gcPercent)}
      </span>
      <span className="text-muted-foreground">
        {w.gcPercent === null ? `${formatPercent(w.nFraction * 100)} N (gap)` : 'GC content'}
      </span>
      <span className="text-muted-foreground tabular-nums">bases {formatRange(w.start, w.end)}</span>
      {w.gcPercent !== null && w.nFraction > 0 && (
        <span className="text-muted-foreground tabular-nums">{formatPercent(w.nFraction * 100)} N excluded</span>
      )}
      <span className="text-muted-foreground tabular-nums">
        window {formatCount(index + 1)} of {formatCount(total)}
      </span>
    </div>
  )
}

function describeWindow(w: GcWindow, index: number, total: number): string {
  const where = `Window ${index + 1} of ${total}, bases ${formatRange(w.start, w.end)}`
  return w.gcPercent === null
    ? `${where}: no data, ${formatPercent(w.nFraction * 100)} N.`
    : `${where}: ${formatPercent(w.gcPercent)} GC.`
}

// ---- Pure helpers ------------------------------------------------------------

/**
 * Build an SVG path through the window midpoints. "M" (move) starts a new
 * segment after each gap, so the line visibly breaks instead of bridging
 * across unknown sequence. Single windows between gaps are returned
 * separately so they can be drawn as dots.
 */
function buildLine(
  windows: GcWindow[],
  xOfWindow: (w: GcWindow) => number,
  yOf: (gc: number) => number,
): { path: string; isolatedPoints: { x: number; y: number }[] } {
  let path = ''
  const isolatedPoints: { x: number; y: number }[] = []
  windows.forEach((w, i) => {
    if (w.gcPercent === null) return
    const x = xOfWindow(w)
    const y = yOf(w.gcPercent)
    const prevIsData = i > 0 && windows[i - 1].gcPercent !== null
    const nextIsData = i < windows.length - 1 && windows[i + 1].gcPercent !== null
    if (!prevIsData && !nextIsData) isolatedPoints.push({ x, y })
    path += `${prevIsData ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  })
  return { path, isolatedPoints }
}

/** Join neighboring gap windows into single [start, end) bands. */
function mergeGaps(windows: GcWindow[]): { start: number; end: number }[] {
  const bands: { start: number; end: number }[] = []
  for (const w of windows) {
    if (w.gcPercent !== null) continue
    const last = bands.at(-1)
    if (last && last.end === w.start) last.end = w.end
    else bands.push({ start: w.start, end: w.end })
  }
  return bands
}

/** Round tick positions (0, 500, 1,000 ...) for an axis from 0 to max. */
function niceTicks(max: number, targetCount: number): number[] {
  if (max <= 0) return [0]
  const rough = max / targetCount
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10
  const ticks: number[] = []
  for (let t = 0; t <= max; t += step) ticks.push(t)
  return ticks
}

/**
 * Track an element's width so the SVG can be drawn at real pixel size
 * (text stays crisp and never stretches). ResizeObserver reports the
 * width on first observe and again whenever it changes.
 */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
