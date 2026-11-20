/**
 * SequenceInput: the DNA paste box.
 *
 * This is a "controlled component": it does not own the text. The parent page
 * holds the text in state, parses it, and passes both down as props:
 *
 *   const [text, setText] = useState('')
 *   const result = useMemo(() => parseSequenceInput(text), [text])
 *   <SequenceInput value={text} onChange={setText} result={result} />
 *
 * Keeping the text in the parent lets the parent use the same parse result
 * for the stats, the chart and the Save button (later steps), so the
 * sequence is parsed once and every part of the page agrees.
 */
import { useId, useRef } from 'react'
import { AlertCircle, CheckCircle2, FlaskConical, X } from 'lucide-react'

import { Button, Label, Textarea, cn } from '@/components/ui'
import { EXAMPLE_FASTA } from '@/lib/gc/example'
import {
  MAX_NUCLEOTIDES,
  countSequenceCharacters,
  lineColumnToIndex,
  type ParseResult,
} from '@/lib/gc/sequence'

interface SequenceInputProps {
  /** The text in the box (owned by the parent). */
  value: string
  /** Called with the new text on every change (typing, paste, example, clear). */
  onChange: (value: string) => void
  /** parseSequenceInput(value), computed by the parent. */
  result: ParseResult
}

const formatNumber = (n: number) => n.toLocaleString('en-US')

export function SequenceInput({ value, onChange, result }: SequenceInputProps) {
  // useId gives stable, unique ids so the label, help text and messages can be
  // linked to the textarea for screen readers (htmlFor / aria-describedby).
  const id = useId()
  const textareaId = `${id}-sequence`
  const helpId = `${id}-help`
  const counterId = `${id}-counter`
  const statusId = `${id}-status`

  // A ref is a direct handle to the real <textarea> DOM element, used to move
  // the cursor to an error. Unlike state, changing a ref does not re-render.
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Derived values: computed from props on every render, never stored in state.
  const isEmpty = value.trim() === ''
  const count = countSequenceCharacters(value)
  const overLimit = count > MAX_NUCLEOTIDES
  const error = !isEmpty && !result.ok ? result.error : null

  // Select the bad character in the textarea so the user can see and fix it.
  function showErrorLocation() {
    if (!error?.line || !error.column) return
    const index = lineColumnToIndex(value, error.line, error.column)
    const textarea = textareaRef.current
    if (index === null || !textarea) return
    textarea.focus()
    textarea.setSelectionRange(index, index + 1)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={textareaId}>DNA sequence</Label>
          <p id={helpId} className="text-sm text-muted-foreground">
            Paste a raw sequence or one FASTA record. Allowed bases: A, C, G, T and N, in
            any case.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onChange(EXAMPLE_FASTA)}>
            <FlaskConical aria-hidden="true" />
            Load example
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange('')
              textareaRef.current?.focus()
            }}
            disabled={value === ''}
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        </div>
      </div>

      <Textarea
        ref={textareaRef}
        id={textareaId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'>my_sequence\nACGTACGTNNACGT...'}
        rows={10}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={`${helpId} ${counterId} ${statusId}`}
        className={cn(
          'min-h-48 resize-y font-mono text-sm leading-relaxed break-all',
          error && 'border-destructive focus-visible:ring-destructive',
        )}
      />

      {/* Counter and a small bar showing how much of the limit is used. */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              overLimit ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${Math.min(count / MAX_NUCLEOTIDES, 1) * 100}%` }}
          />
        </div>
        <p
          id={counterId}
          className={cn(
            'text-sm tabular-nums',
            overLimit ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {formatNumber(count)} / {formatNumber(MAX_NUCLEOTIDES)} nucleotides
        </p>
      </div>

      {/* Status: aria-live makes screen readers announce changes politely. */}
      <div id={statusId} aria-live="polite" className="min-h-6 text-sm">
        {error && (
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{error.message}</span>
            {error.line && error.column && (
              <button
                type="button"
                onClick={showErrorLocation}
                className="cursor-pointer font-medium underline underline-offset-2"
              >
                Show me
              </button>
            )}
          </div>
        )}
        {result.ok && (
          <p className="flex items-center gap-2 text-success">
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            <span>
              Valid sequence
              {result.value.name && (
                <>
                  {' · '}
                  <span className="text-muted-foreground">
                    FASTA header: <span className="text-foreground">{result.value.name}</span>
                  </span>
                </>
              )}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
