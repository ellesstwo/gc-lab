/**
 * GC Lab brand mark: a stylized double helix on a teal tile.
 * The same drawing is saved as public/favicon.svg (the browser tab icon).
 * Decorative: the "GC Lab" text next to it carries the name.
 */
export function GcLabMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect width="24" height="24" rx="5.5" fill="#2bc0b4" />
      <g fill="none" stroke="#04201d" strokeWidth="1.8" strokeLinecap="round">
        {/* two strands, half a turn apart, crossing in the middle */}
        <path d="M3 12Q7.5 2 12 12T21 12" />
        <path d="M3 12Q7.5 22 12 12T21 12" />
        {/* base pairs (rungs) where the strands are furthest apart */}
        <path d="M7.5 9v6M16.5 9v6" strokeWidth="1.4" />
      </g>
    </svg>
  )
}
