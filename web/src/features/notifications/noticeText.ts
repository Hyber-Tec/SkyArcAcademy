import type { NotificationType } from '@shared/comms'
import { type Lang, dateText } from '@shared/i18n'
import type { NoticeKey } from '@shared/notices'
import { type DateKey, addDays, diffDays, formatDateKey } from '@shared/time'

/**
 * The inbox and its switches in a parent's language (docs/DECISIONS.md §36): each notice carries its own Korean
 * (`AppNotification.ko`, written by the server); these are the app's words around it. The office's are English.
 */

/** The kinds of notice a family gets, in Korean (the office's kinds stay English). */
const NOTIFICATION_LABELS_KO: Partial<Record<NotificationType, string>> = {
  announcement: '아카데미 소식',
  announcement_updated: '소식 수정',
  session_created: '새 수업',
  session_canceled: '수업 취소',
  session_restored: '수업 다시 열림',
  session_deleted: '수업 삭제',
  session_time_changed: '시간 변경',
  session_date_changed: '날짜 변경',
  session_no_show: '결석',
  report_shared: '성장 리포트',
  class_requested: '수업 신청',
  request_approved: '신청 승인',
  request_rejected: '신청 거절',
  request_offered: '다른 시간 제안',
  request_accepted: '제안 수락',
  request_asked_again: '다시 신청',
  score_added: '새 점수',
  contract_sent: '서명할 계약서',
  contract_signed: '계약서 서명 완료',
}

export const noticeLabelIn = (type: string, english: string, lang: Lang): string =>
  lang === 'ko' ? (NOTIFICATION_LABELS_KO[type as NotificationType] ?? (english === 'Notification' ? '알림' : english)) : english

/** The family's switches (shared/src/notices.ts FAMILY_SWITCHES), in Korean. */
export const FAMILY_SWITCHES_KO: Partial<Record<NoticeKey, { label: string; help: string }>> = {
  classChanges: { label: '수업 변경', help: '수업 취소, 시간 변경, 삭제, 결석' },
  requests: { label: '신청 답변', help: '신청한 수업을 아카데미가 승인하거나 거절했을 때, 다른 시간을 제안했을 때' },
  scores: { label: '새 점수', help: '새 점수가 저장됐을 때' },
  reports: { label: '성장 리포트', help: '아카데미가 성장 리포트를 보냈을 때' },
  announcements: { label: '아카데미 소식', help: '아카데미가 가족에게 올린 소식' },
}

/** The inbox's day headers: "Today", "Yesterday", "Thu", "Oct 30"; "오늘", "어제", "목요일", "10월 30일". */
export function dayHeaderIn(d: DateKey, today: DateKey, lang: Lang): string {
  const ko = lang === 'ko'
  if (d === today) return ko ? '오늘' : 'Today'
  if (d === addDays(today, -1)) return ko ? '어제' : 'Yesterday'
  const ago = diffDays(d, today)
  if (ago > 0 && ago < 7) return ko ? dateText(d, 'weekday', 'ko') : formatDateKey(d, 'weekdayMedium').split(',')[0]
  return dateText(d, ago > 365 ? 'medium' : 'monthDay', lang)
}
