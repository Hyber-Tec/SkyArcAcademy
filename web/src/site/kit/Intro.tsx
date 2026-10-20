import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { forcedReduce } from './motion'

/**
 * The logo intro's rules: on the homepage, once per visit (per browser tab), never with reduced motion; a tap, click
 * or any key skips it, and the page can't scroll under it. A link to another page (a news post someone shared) opens
 * that page straight away. `?intro` in the address plays it again.
 */
const home = () => /^\/(ko\/?)?$/.test(location.pathname)

export function useIntro(key: string) {
  const [show, setShow] = useState(() => {
    if (forcedReduce || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    if (new URLSearchParams(location.search).has('intro')) return true
    if (!home()) return false
    try {
      return !sessionStorage.getItem(key)
    } catch {
      return true
    }
  })
  const done = useCallback(() => {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      // Shown again next time: fine.
    }
    setShow(false)
  }, [key])
  return { show, done }
}

export function IntroShell({ onDone, duration, className, children, skipLabel = 'Skip intro' }: { onDone: () => void; duration: number; className?: string; children: ReactNode; skipLabel?: string }) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration)
    const skip = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return
      onDone()
    }
    window.addEventListener('keydown', skip)
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip)
      root.style.overflow = before
    }
  }, [onDone, duration])
  return (
    <div className={cn('fixed inset-0 z-[100] cursor-pointer select-none', className)} onPointerDown={onDone} role="presentation">
      {children}
      <button
        type="button"
        onClick={onDone}
        className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:bottom-4 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-black"
      >
        {skipLabel}
      </button>
    </div>
  )
}
