/**
 * WindowSizeControl: lets the user change the window size.
 *
 * The box keeps its own "draft" text while the user types, and only reports
 * a new size on Enter or when the box loses focus. Otherwise typing "250"
 * would briefly try a window of 2 (clamped to the minimum) and redraw the
 * chart on every keystroke.
 *
 * The parent gives this component a `key` equal to the current size, so when
 * the size changes from outside (new sequence, Reset) React creates a fresh
 * copy and the draft starts from the new value. No syncing code is needed.
 */
import { useId, useState } from 'react'
import { RotateCcw } from 'lucide-react'

import { Button, Input, Label } from '@/components/ui'
import { formatCount } from './format'

interface WindowSizeControlProps {
  value: number
  defaultValue: number
  limits: { min: number; max: number }
  windowCount: number
  onChange: (size: number | null) => void // null = back to the default
}

export function WindowSizeControl({ value, defaultValue, limits, windowCount, onChange }: WindowSizeControlProps) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))

  function commit() {
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value)) // not a number: put the current value back
      return
    }
    // Keep it a whole number inside the allowed range, and show the user
    // the size that will actually be used.
    const size = Math.min(Math.max(Math.round(parsed), limits.min), limits.max)
    setDraft(String(size))
    if (size !== value) onChange(size)
  }

  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-size`}>Window size (bp)</Label>
        <Input
          id={`${id}-size`}
          type="number"
          inputMode="numeric"
          min={limits.min}
          max={limits.max}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          aria-describedby={`${id}-help`}
          className="w-28 tabular-nums"
        />
      </div>
      {value !== defaultValue && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          <RotateCcw aria-hidden="true" />
          Reset to {formatCount(defaultValue)}
        </Button>
      )}
      <p id={`${id}-help`} className="basis-full text-xs text-muted-foreground">
        {formatCount(windowCount)} {windowCount === 1 ? 'window' : 'windows'} · allowed {formatCount(limits.min)}–{formatCount(limits.max)} bp
      </p>
    </div>
  )
}
