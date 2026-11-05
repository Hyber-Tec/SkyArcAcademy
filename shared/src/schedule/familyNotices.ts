import type { NotificationType } from '../comms'
import { dateText, timeRangeText, timeText } from '../i18n'
import { POSITION_LABELS_KO, type Position } from '../shooting/evaluation'
import { type DateKey, formatDateKey, formatMinutes, formatTimeRange } from '../time'
import { seatKind } from './classes'
import type { SessionSnapshot } from './notify'
import { type ClassOffer, type ClassRequest, REQUEST_KIND_LABELS } from './requests'

/**
 * What families and the office are told about classes (docs/DECISIONS.md §23): the family when the academy changes
 * their child's class, answers a request or suggests another time; the office when a family cancels, asks, accepts a
 * time suggested or asks for another. The texts live here, the sending in functions/src (requests.ts, sessionNotify.ts).
 * What a family hears carries its Korean too (`ko`, docs/DECISIONS.md §36), written as .claude/skills/korean-ux-writing
 * says: a parent reading Korean sees it in the app, and a phone set to Korean gets it as its push.
 */

export interface Notice {
  type: NotificationType
  title: string
  body: string
  ko?: { title: string; body: string }
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name
const day = (d: DateKey) => formatDateKey(d, 'weekdayMedium')
const at = (s: { dateKey: DateKey; startMin: number }) => `${day(s.dateKey)} at ${formatMinutes(s.startMin)}`
const span = (s: { dateKey: DateKey; startMin: number; endMin: number }) => `${day(s.dateKey)}, ${formatTimeRange(s.startMin, s.endMin)}`
const ASK = 'A makeup can be asked for in Classes.'

// The same in Korean: "11월 5일 (목)", "11월 5일 (목) 오후 4:30", "11월 5일 (목) 오후 4:30~5:30".
const dayKo = (d: DateKey) => dateText(d, 'weekdayMedium', 'ko')
const mdKo = (d: DateKey) => dateText(d, 'monthDay', 'ko')
const atKo = (s: { dateKey: DateKey; startMin: number }) => `${dayKo(s.dateKey)} ${timeText(s.startMin, 'ko')}`
const spanKo = (s: { dateKey: DateKey; startMin: number; endMin: number }) => `${dayKo(s.dateKey)} ${timeRangeText(s.startMin, s.endMin, 'ko')}`
const ASK_KO = '보강은 수업 탭에서 신청할 수 있어요.'

/** A seat the office changed, as its family hears of it; null when there's nothing to tell. */
export function familyClassNotice(before: SessionSnapshot & { note?: string }, after: SessionSnapshot & { note?: string }, nowMs: number): Notice | null {
  const who = first(after.studentName || before.studentName)
  const makeup = seatKind(after.note) === 'makeup'
  // A missed class is marked on the day: it's told whenever it's marked.
  if (!after.isDeleted && after.status === 'no_show' && before.status !== 'no_show') {
    return makeup
      ? {
          type: 'session_no_show',
          title: 'Makeup missed',
          body: `${who} missed the makeup on ${at(after)}. It counts as used.`,
          ko: { title: '보강 결석', body: `${who} 학생이 ${atKo(after)} 보강에 오지 않았어요. 이번 보강은 사용한 것으로 처리돼요.` },
        }
      : {
          type: 'session_no_show',
          title: 'Class missed',
          body: `${who} missed the class on ${at(after)}. ${ASK}`,
          ko: { title: '수업 결석', body: `${who} 학생이 ${atKo(after)} 수업에 오지 않았어요. ${ASK_KO}` },
        }
  }
  // Everything else only for classes still ahead.
  if (Math.max(before.startMs, after.startMs) <= nowMs) return null
  const live = (s: SessionSnapshot) => !s.isDeleted && s.status !== 'canceled'
  if (live(before) && !live(after)) {
    return after.isDeleted
      ? {
          type: 'session_deleted',
          title: 'Class removed',
          body: `${who}’s class on ${at(before)} was taken off the schedule.`,
          ko: { title: '수업 삭제', body: `${atKo(before)} ${who} 학생 수업이 일정에서 빠졌어요.` },
        }
      : {
          type: 'session_canceled',
          title: 'Class canceled',
          body: `${who}’s class on ${at(after)} is canceled.${makeup ? '' : ` ${ASK}`}`,
          ko: { title: '수업 취소', body: `${atKo(after)} ${who} 학생 수업이 취소됐어요.${makeup ? '' : ` ${ASK_KO}`}` },
        }
  }
  if (!live(before) && live(after)) {
    return {
      type: 'session_restored',
      title: 'Class back on',
      body: `${who}’s class on ${at(after)} is back on.`,
      ko: { title: '수업 다시 진행', body: `${atKo(after)} ${who} 학생 수업을 다시 진행해요.` },
    }
  }
  if (!live(after)) return null
  if (before.dateKey !== after.dateKey) {
    return {
      type: 'session_date_changed',
      title: 'Class moved',
      body: `${who}’s class moved from ${day(before.dateKey)} to ${span(after)}.`,
      ko: { title: '수업 날짜 변경', body: `${who} 학생의 ${dayKo(before.dateKey)} 수업을 옮겼어요. 바뀐 일정: ${spanKo(after)}` },
    }
  }
  if (before.startMin !== after.startMin || before.endMin !== after.endMin) {
    return {
      type: 'session_time_changed',
      title: 'Class time changed',
      body: `${who}’s class on ${day(after.dateKey)} is now ${formatTimeRange(after.startMin, after.endMin)}.`,
      ko: { title: '수업 시간 변경', body: `${dayKo(after.dateKey)} ${who} 학생 수업 시간이 바뀌었어요. 바뀐 시간: ${timeRangeText(after.startMin, after.endMin, 'ko')}` },
    }
  }
  return null
}

/** A makeup or extra class the office booked itself, for a class still ahead: the family hears of it. */
export function familyBookedNotice(s: SessionSnapshot & { note?: string }, nowMs: number): Notice | null {
  if (s.isDeleted || s.status === 'canceled' || s.startMs <= nowMs) return null
  const kind = seatKind(s.note)
  const who = first(s.studentName)
  if (kind === 'makeup') {
    return { type: 'session_created', title: 'Makeup booked', body: `${who}’s makeup is booked: ${span(s)}.`, ko: { title: '보강 예약', body: `${who} 학생 보강을 잡았어요: ${spanKo(s)}` } }
  }
  if (kind === 'practice') {
    return { type: 'session_created', title: 'Extra class booked', body: `${who}’s extra class is booked: ${span(s)}.`, ko: { title: '추가 수업 예약', body: `${who} 학생 추가 수업을 잡았어요: ${spanKo(s)}` } }
  }
  return null
}

/** The office hears that a family canceled. */
export function familyCanceledNotice(s: { studentName: string; dateKey: DateKey; startMin: number }, by: { name: string; role: 'parent' | 'student' }): Notice {
  const whom = by.role === 'student' ? 'themself' : `their parent${by.name ? ` (${by.name})` : ''}`
  return { type: 'class_canceled_by_family', title: 'Canceled by the family', body: `${s.studentName}’s class on ${at(s)} was canceled by ${whom}.` }
}

/** "Jiyeon Hwang (for Jiwoo)", or the student by name: who took a step on a request. */
const askerOf = (studentName: string, by: { name: string; role: 'parent' | 'student' }) =>
  by.role === 'student' ? studentName : `${by.name || 'A parent'} (for ${first(studentName)})`

/** The office hears of a request to approve. */
export function requestedNotice(r: Pick<ClassRequest, 'kind' | 'studentName' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey' | 'requestedBy'>): Notice {
  const what =
    r.kind === 'makeup' && r.forDateKey
      ? `a makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
      : r.kind === 'reschedule' && r.forDateKey
        ? `to move ${formatDateKey(r.forDateKey, 'monthDay')}’s class`
        : 'an extra class'
  return { type: 'class_requested', title: `Request: ${REQUEST_KIND_LABELS[r.kind]}`, body: `${askerOf(r.studentName, r.requestedBy)} asks for ${what}: ${span(r)}.` }
}

/** The family hears the academy suggests another class instead of the one asked for. */
export function offeredNotice(
  r: Pick<ClassRequest, 'kind' | 'studentName' | 'dateKey' | 'startMin' | 'forDateKey'>,
  offer: Pick<ClassOffer, 'dateKey' | 'startMin' | 'endMin' | 'note'>,
): Notice {
  const who = first(r.studentName)
  const what =
    r.kind === 'makeup' && r.forDateKey
      ? `${who}’s makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
      : r.kind === 'reschedule' && r.forDateKey
        ? `moving ${who}’s class on ${formatDateKey(r.forDateKey, 'monthDay')}`
        : `${who}’s ${r.kind === 'extra' ? 'extra class' : 'request'}`
  const note = offer.note.trim()
  const whatKo =
    r.kind === 'makeup' && r.forDateKey
      ? `${who} 학생 ${mdKo(r.forDateKey)} 수업 보강`
      : r.kind === 'reschedule' && r.forDateKey
        ? `${who} 학생 ${mdKo(r.forDateKey)} 수업 시간 변경`
        : `${who} 학생 ${r.kind === 'extra' ? '추가 수업' : '신청'}`
  return {
    type: 'request_offered',
    title: 'Another time suggested',
    body: `For ${what}, the academy suggests ${span(offer)} instead of ${at(r)}.${note ? ` “${note}”` : ''} Accept it or ask for another time in Classes.`,
    ko: {
      title: '다른 시간 제안',
      body: `${whatKo}: 신청하신 ${atKo(r)} 대신 이 시간은 어떠세요? ${spanKo(offer)}.${note ? ` “${note}”` : ''} 수업 탭에서 수락하거나 다른 시간을 신청할 수 있어요.`,
    },
  }
}

/** The office hears the family accepted the class suggested: it's booked, with its seat's label. */
export function acceptedNotice(r: Pick<ClassRequest, 'studentName'>, by: { name: string; role: 'parent' | 'student' }, booked: { dateKey: DateKey; startMin: number; endMin: number }, label: string): Notice {
  return { type: 'request_accepted', title: 'Suggestion accepted', body: `${askerOf(r.studentName, by)} accepted ${span(booked)}: ${r.studentName} is booked (${label}).` }
}

/** The office hears the family asks for another class instead of the one suggested. */
export function askedAgainNotice(
  r: Pick<ClassRequest, 'kind' | 'studentName'>,
  by: { name: string; role: 'parent' | 'student' },
  asked: { dateKey: DateKey; startMin: number; endMin: number },
  message: string,
): Notice {
  const words = message.trim()
  return {
    type: 'request_asked_again',
    title: `Asked again: ${REQUEST_KIND_LABELS[r.kind]}`,
    body: `${askerOf(r.studentName, by)} asks for ${span(asked)} instead of the time suggested.${words ? ` “${words}”` : ''}`,
  }
}

/** The family hears the answer. */
export function decidedNotice(r: Pick<ClassRequest, 'kind' | 'studentName' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey' | 'decisionNote'>, approved: boolean): Notice {
  const who = first(r.studentName)
  if (approved) {
    const what = r.kind === 'extra' ? 'extra class' : r.kind === 'reschedule' ? 'class' : 'makeup'
    const moved = r.kind === 'reschedule' && r.forDateKey ? ` (moved from ${formatDateKey(r.forDateKey, 'monthDay')})` : ''
    const whatKo = r.kind === 'extra' ? '추가 수업' : r.kind === 'reschedule' ? '옮긴 수업' : '보강'
    const movedKo = r.kind === 'reschedule' && r.forDateKey ? ` (원래 ${mdKo(r.forDateKey)} 수업)` : ''
    return {
      type: 'request_approved',
      title: 'Request approved',
      body: `${who}’s ${what} is booked: ${span(r)}${moved}.`,
      ko: { title: '신청 승인', body: `${who} 학생 ${whatKo} 일정이 잡혔어요: ${spanKo(r)}${movedKo}` },
    }
  }
  const note = r.decisionNote.trim()
  return {
    type: 'request_rejected',
    title: 'Request not approved',
    body: `${who}’s request for ${at(r)} wasn’t approved.${note ? ` “${note}”` : ''} Another time can be asked for in Classes.`,
    ko: { title: '신청 결과', body: `${atKo(r)} ${who} 학생 신청은 승인되지 않았어요.${note ? ` “${note}”` : ''} 다른 시간은 수업 탭에서 신청할 수 있어요.` },
  }
}

/** A new score, as its family hears of it: "Standing, 186.8 over 20 shots", a competition with its match and inner tens. */
export function scoreAddedNotice(e: {
  studentName: string
  position: string
  total: number
  wholeTotal?: number
  shots: number
  source: string
  innerTens?: number | null
  kind?: string
  match?: { name: string } | null
}): Notice {
  const pos = e.position ? `${e.position[0].toUpperCase()}${e.position.slice(1)}, ` : ''
  const whole = e.source === 'paper' || (e.source === 'sheet' && Number.isInteger(e.total))
  const total = whole ? String(e.wholeTotal ?? Math.round(e.total)) : Number(e.total).toFixed(1)
  const tens = e.kind === 'competition' && e.innerTens != null ? `-${e.innerTens}` : ''
  const match = e.kind === 'competition' ? `${e.match?.name || 'A competition'}, ` : ''
  const posKo = e.position in POSITION_LABELS_KO ? `${POSITION_LABELS_KO[e.position as Position]}, ` : ''
  const matchKo = e.kind === 'competition' ? `${e.match?.name || '대회'}, ` : ''
  return {
    type: 'score_added',
    title: e.kind === 'competition' ? 'New competition result' : 'New score',
    body: `${first(e.studentName)}: ${match}${pos}${total}${tens} over ${e.shots} shot${e.shots === 1 ? '' : 's'}.`,
    ko: { title: e.kind === 'competition' ? '새 대회 기록' : '새 점수', body: `${first(e.studentName)}: ${matchKo}${posKo}${total}${tens || '점'} (${e.shots}발)` },
  }
}
