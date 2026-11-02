import { useEffect, useState } from 'react'

const KEY = 'skyarc:scores-sections'

/**
 * Which of the Scores tab's folded sections are open on this device (the scores over time, the comparison, the
 * reports), remembered as the Drive remembers its layout. All folded at first.
 */
export function useOpenSections(): [ReadonlySet<string>, (id: string) => void] {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
      return new Set(Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...open]))
    } catch {
      /* private mode */
    }
  }, [open])
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return [open, toggle]
}
