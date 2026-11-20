/**
 * Colors for the analyzer's charts.
 *
 * The A/C/G/T colors are the first four slots of a validated categorical
 * palette (dark-mode steps), checked against this app's dark card surface
 * (#161616) for colorblind separation and contrast: all checks pass.
 * N ("unknown") is deliberately a neutral gray, not a hue.
 *
 * If the app switches to a light theme, these need their light-mode steps.
 */
import type { BaseCounts } from '@/lib/gc/gc'

export const BASES = ['A', 'C', 'G', 'T', 'N'] as const satisfies readonly (keyof BaseCounts)[]

export const BASE_COLORS: Record<keyof BaseCounts, string> = {
  A: '#3987e5', // blue
  C: '#d95926', // orange
  G: '#199e70', // aqua
  T: '#c98500', // yellow
  N: '#898781', // neutral gray
}

/** Text color for a label printed inside each colored block. */
export const BASE_LABEL_INK: Record<keyof BaseCounts, string> = {
  A: '#ffffff',
  C: '#ffffff',
  G: '#ffffff',
  T: '#ffffff',
  N: '#0b0b0b',
}

/** The GC line (single series, so it takes the first palette slot). */
export const GC_LINE_COLOR = '#3987e5'
