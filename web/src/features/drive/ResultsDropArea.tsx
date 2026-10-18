import { useRef } from 'react'
import { LuFileUp } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * The top of the Drive, for the staff: where SIUS results come in (the owner, 2026-10-18). PDFs dropped on it (the page
 * takes the drop, anywhere on it) or chosen with its button are read for each result's date and scores; the results
 * dialog then asks whose each one is and its position, files it in the student's folder and saves its scores. Anything
 * else is uploaded as it is. While files are dragged over the page or PDFs are read, it stays in view at the top.
 */
export function ResultsDropArea({
  studentName,
  folderName,
  dragging,
  reading,
  disabled,
  onFiles,
}: {
  /** Inside a student's folder (or a folder in it): every result is this student's. */
  studentName: string | null
  /** The folder open, where other files land (null: the top of the Drive). */
  folderName: string | null
  /** Files are being dragged over the page. */
  dragging: boolean
  /** PDFs being read, and how many are done. */
  reading: { done: number; total: number } | null
  disabled: boolean
  onFiles: (files: File[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const idle = !reading && !dragging
  let title: React.ReactNode
  let line: string
  if (reading) {
    title = reading.total === 1 ? 'Reading the PDF…' : `Reading ${Math.min(reading.done + 1, reading.total)} of ${reading.total}…`
    line = studentName ? `Then you check the position of each of ${studentName}’s results.` : 'Then you choose whose result each one is and its position.'
  } else if (dragging) {
    title = 'Drop the files to add them'
    line = studentName
      ? `SIUS PDFs are read and filed here as ${studentName}’s results; other files are uploaded here as they are.`
      : `SIUS PDFs are read and filed in each student’s folder; other files are uploaded ${folderName ? `into “${folderName}”` : 'to the Drive'} as they are.`
  } else {
    const whose = studentName ? `${studentName}’s SIUS PDFs` : 'SIUS PDFs'
    // A phone can't drag files in: there it's the button, beside the title.
    title = (
      <>
        <span className="sm:hidden">Add {whose}</span>
        <span className="hidden sm:inline">
          Drop {whose} here<span className="font-normal text-muted-foreground"> · one or several</span>
        </span>
      </>
    )
    line = studentName
      ? 'The app reads each result’s date and scores and asks the position, then files it in this folder and saves the scores.'
      : 'The app reads each result’s date and scores, asks whose it is and the position, then files it in the student’s folder and saves the scores.'
  }
  return (
    // Phones: the title and the button, the line under both. Wider: the icon, the title over the line, the button.
    <section
      aria-label="Add SIUS results"
      data-testid="drive-drop-area"
      data-state={reading ? 'reading' : dragging ? 'dragging' : 'idle'}
      className={cn(
        'mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-3 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:pl-4',
        !idle && 'sticky top-14 z-40 bg-card shadow-lg md:top-3',
        dragging && 'border-brand/70 bg-[color-mix(in_oklab,var(--brand)_6%,var(--card))]',
      )}
    >
      <span className={cn('hidden size-10 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors sm:row-span-2 sm:flex', dragging && 'border-brand/40 text-brand-text')}>
        {reading ? <Spinner className="size-5" /> : <LuFileUp className="size-5" />}
      </span>
      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold sm:col-start-2 sm:self-end" aria-live="polite">
        {reading ? <Spinner className="shrink-0 sm:hidden" /> : null}
        <span className="min-w-0 text-balance">{title}</span>
      </p>
      <Button variant="outline" className="sm:col-start-3 sm:row-span-2 sm:row-start-1" disabled={disabled || !!reading} onClick={() => input.current?.click()}>
        <LuFileUp /> Choose PDFs
      </Button>
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-2 sm:self-start">
        <p className="text-[13px] leading-snug text-pretty text-muted-foreground">
          {idle ? <span className="sm:hidden">One or several. </span> : null}
          {line}
        </p>
        {reading && reading.total > 1 ? <Progress value={(reading.done / reading.total) * 100} className="mt-2 h-1 max-w-sm" /> : null}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        hidden
        data-testid="drive-drop-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </section>
  )
}
