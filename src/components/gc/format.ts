/** Number formatting shared by the analyzer components. */

/** 25000 -> "25,000" */
export const formatCount = (n: number) => n.toLocaleString('en-US')

/** 47.333 -> "47.3%" (one decimal place) */
export const formatPercent = (n: number) => `${n.toFixed(1)}%`

/** 0-based half-open window [start, end) -> "1,001–1,050" (1-based, inclusive, as biologists count). */
export const formatRange = (start: number, end: number) =>
  `${formatCount(start + 1)}–${formatCount(end)}`
