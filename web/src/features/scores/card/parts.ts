import { useSyncExternalStore } from 'react'
import type { Evaluation } from '@shared/shooting/evaluation'
import type { BullState } from '@shared/targets/review'
import type { WithId } from '@shared/types'

/** A scanned card's page, where its shots are checked on its picture: under the student, in either staff portal. */
export function cardPath(mode: 'admin' | 'coach', e: Pick<WithId<Evaluation>, 'id' | 'studentId'>): string {
  return `/${mode}/students/${e.studentId}/scores/${e.id}`
}

/** The colours a bull's state shows in, on the photo and its tile (as the phone app's): they read on black and on buff paper. */
export const STATE_COLORS: Record<BullState, string> = { ok: '#22C55E', check: '#F59E0B', missing: '#F59E0B', unseen: '#A3A3A3' }

/** A counted shot on the photo, and one being moved. */
export const SHOT_COLOR = '#22C55E'
export const MOVING_COLOR = '#38BDF8'
/** The ring lines drawn over a bull up close. */
export const RING_LINE = 'rgba(56, 189, 248, 0.8)'

/** A bull's score as its badge and tile show it: "9", "8 · 7", "–" with no shot. */
export function scoreLabel(values: number[]): string {
  return values.length ? values.join(' · ') : '–'
}

/** Whether a media query matches, following it as it changes. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Touch screens: "tap" and "pinch" in the words shown, rather than "click" and "the wheel". */
export function useTouchScreen(): boolean {
  return useMedia('(pointer: coarse)')
}

let family: string | null = null
/** The page's font, for words drawn on a canvas. */
function fontFamily(): string {
  family ??= getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
  return family
}

/**
 * A rounded label drawn on a canvas in view pixels (it keeps its size whatever the zoom): its bottom-right corner at
 * (x, y), or centred above (x, y) with `anchor: 'above'`.
 */
export function drawPill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, anchor: 'corner' | 'above' = 'corner') {
  ctx.save()
  ctx.font = `600 12px ${fontFamily()}`
  const w = Math.ceil(ctx.measureText(text).width) + 14
  const h = 19
  const left = anchor === 'corner' ? x - w : x - w / 2
  const top = y - h
  ctx.beginPath()
  ctx.roundRect(left, top, w, h, h / 2)
  ctx.fillStyle = color
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 3
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#0a0a0a'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + 7, top + h / 2 + 0.5)
  ctx.restore()
}
