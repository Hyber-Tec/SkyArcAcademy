import { type Lang, dateText, instantTimeText, timeRangeText } from '@shared/i18n'
import {
  type ClassRequest,
  type ClassRequestAction,
  type ClassRequestStep,
  type FamilyCancel,
  REQUEST_KIND_LABELS_KO,
  cancelHours,
  classWhen,
  offerText,
  requestLine,
  requestStepText,
} from '@shared/schedule/requests'
import type { BranchSettings } from '@shared/settings/defaults'
import { addDays, dateKeyOf, todayKey } from '@shared/time'
import type { TimestampLike } from '@shared/types'
import { when } from '@/features/website/messageText'

/**
 * A family's requests in their language (docs/DECISIONS.md §36): the English exactly as shared/src/schedule/requests.ts
 * writes it, the Korean written for Korean parents (.claude/skills/korean-ux-writing).
 */

/** "Thu, Nov 5, 4:30 PM – 5:30 PM", "11월 5일 (목) 오후 4:30~5:30". */
export function classWhenIn(c: Pick<ClassRequest, 'dateKey' | 'startMin' | 'endMin'>, lang: Lang): string {
  return lang === 'ko' ? `${dateText(c.dateKey, 'weekdayMedium', 'ko')} ${timeRangeText(c.startMin, c.endMin, 'ko')}` : classWhen(c)
}

/** A request in one line: "Makeup for Oct 13 · …", "10월 13일 수업 보강 · …". */
export function requestLineIn(r: Pick<ClassRequest, 'kind' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey'>, lang: Lang): string {
  if (lang !== 'ko') return requestLine(r)
  const what =
    r.kind === 'makeup' && r.forDateKey
      ? `${dateText(r.forDateKey, 'monthDay', 'ko')} 수업 보강`
      : r.kind === 'reschedule' && r.forDateKey
        ? `${dateText(r.forDateKey, 'monthDay', 'ko')} 수업 옮기기`
        : REQUEST_KIND_LABELS_KO[r.kind]
  return `${what} · ${classWhenIn(r, 'ko')}`
}

/** The academy's suggestion, as the family reads it. */
export function offerTextIn(offer: Pick<NonNullable<ClassRequest['offer']>, 'dateKey' | 'startMin' | 'endMin' | 'by'>, lang: Lang): string {
  return lang === 'ko' ? `아카데미가 제안한 시간: ${classWhenIn(offer, 'ko')}` : offerText(offer, 'family')
}

const SYSTEM_KO: Record<ClassRequestAction, string> = {
  asked: '신청했어요.',
  offered: '다른 시간을 제안했어요.',
  accepted: '제안을 수락했어요.',
  asked_again: '다른 시간을 다시 신청했어요.',
  approved: '승인했어요.',
  rejected: '답변 없이 수업 시간이 지나 신청이 마감됐어요.',
  withdrawn: '신청을 취소했어요.',
}

/** One step of the back and forth, for the family: the reader's own steps have no subject, the office's are 아카데미. */
export function stepTextIn(step: ClassRequestStep, me: string | null | undefined, lang: Lang): string {
  if (lang !== 'ko') return requestStepText(step, 'family', me)
  if (step.by.role === 'system') return SYSTEM_KO[step.action]
  const office = step.by.role === 'owner' || step.by.role === 'admin'
  const who = me && step.by.email === me ? '' : office ? '아카데미가 ' : `${step.by.name || step.by.email || '가족'}님이 `
  const at = step.dateKey && step.startMin !== undefined && step.endMin !== undefined ? classWhenIn({ dateKey: step.dateKey, startMin: step.startMin, endMin: step.endMin }, 'ko') : null
  switch (step.action) {
    case 'asked':
      return at ? `${who}${at} 수업을 신청했어요.` : `${who}신청했어요.`
    case 'offered':
      return at ? `${who}${at} 수업을 제안했어요.` : `${who}다른 시간을 제안했어요.`
    case 'accepted':
      return at ? `${who}${at} 수업 제안을 수락했어요.` : `${who}제안을 수락했어요.`
    case 'asked_again':
      return at ? `${who}대신 ${at} 수업을 신청했어요.` : `${who}다른 시간을 다시 신청했어요.`
    case 'approved':
      return at ? `${who}${at} 수업을 승인했어요.` : `${who}신청을 승인했어요.`
    case 'rejected':
      return `${who}신청을 승인하지 않았어요.`
    case 'withdrawn':
      return `${who}신청을 취소했어요.`
  }
}

/** When something happened: "Today, 4:02 PM", "오늘 오후 4:02", "2026년 11월 3일 오후 4:02". */
export function whenIn(t: TimestampLike | null | undefined, timezone: string, lang: Lang): string {
  if (lang !== 'ko') return when(t, timezone)
  if (!t) return '방금'
  const d = t.toDate()
  const day = dateKeyOf(d, timezone)
  const today = todayKey(timezone)
  const time = instantTimeText(d, timezone, 'ko')
  if (day === today) return `오늘 ${time}`
  if (day === addDays(today, -1)) return `어제 ${time}`
  return `${dateText(day, 'long', 'ko')} ${time}`
}

/** Why a family can't cancel a class now, in their language (the English is the check's own). */
export function cancelMessageIn(check: Extract<FamilyCancel, { ok: false }>, settings: Pick<BranchSettings, 'schedule'>, lang: Lang): string {
  if (lang !== 'ko') return check.message
  if (check.reason === 'gone') return '이 수업은 일정에서 빠졌어요.'
  if (check.reason === 'not_upcoming') return '앞으로 있을 수업만 취소할 수 있어요.'
  const h = cancelHours(settings)
  const span = h % 24 === 0 && h >= 48 ? `${h / 24}일` : `${h}시간`
  return `수업은 시작 ${span} 전까지 취소할 수 있어요.`
}
