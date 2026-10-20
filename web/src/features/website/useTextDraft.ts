import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export type SaveState = 'idle' | 'saving' | 'saved'

/**
 * A text field saved when the person leaves it (or presses Enter in a one-line field), not on every key, so the
 * audit log gets one entry per change. Leaving the browser tab, or the field disappearing (another tab of the page),
 * saves it too; Escape puts back the saved text. While it's edited, someone else's change doesn't overwrite it.
 */
export function useTextDraft(saved: string, save: (value: string) => Promise<void>, opts: { multiline?: boolean } = {}) {
  // What's typed (null: not being edited), and what was sent until the save is done (so the old text never flashes).
  const [draft, setDraft] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [state, setState] = useState<SaveState>('idle')
  const latest = useRef({ draft, sent, saved, save })
  useLayoutEffect(() => {
    latest.current = { draft, sent, saved, save }
  })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const commit = useCallback(() => {
    const { draft: typed, sent: pending, saved: stored, save: fn } = latest.current
    if (typed === null) return
    latest.current.draft = null
    setDraft(null)
    const next = typed.trim()
    if (next === (pending ?? stored).trim()) return
    latest.current.sent = next
    setSent(next)
    setState('saving')
    clearTimeout(timer.current)
    fn(next).then(
      () => {
        setSent(null)
        setState('saved')
        timer.current = setTimeout(() => setState('idle'), 2000)
      },
      (e: Error) => {
        // Keep what was typed, so leaving the field again tries again.
        setSent(null)
        setDraft(next)
        setState('idle')
        toast.error('It couldn’t be saved', { description: e.message })
      },
    )
  }, [])

  useEffect(() => {
    const away = () => {
      if (document.visibilityState === 'hidden') commit()
    }
    document.addEventListener('visibilitychange', away)
    return () => {
      document.removeEventListener('visibilitychange', away)
      commit()
      clearTimeout(timer.current)
    }
  }, [commit])

  return {
    state,
    props: {
      value: draft ?? sent ?? saved,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
          latest.current.draft = null
          setDraft(null)
          e.currentTarget.blur()
        } else if (e.key === 'Enter' && !opts.multiline && !e.nativeEvent.isComposing) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      },
    },
  }
}
