import { useMemo, useState } from 'react'
import { LuCalendarPlus, LuSend } from 'react-icons/lu'
import { toast } from 'sonner'
import { makeupsOwed } from '@shared/schedule/classes'
import type { Lang } from '@shared/i18n'
import type { ClassRequest, ClassRequestKind } from '@shared/schedule/requests'
import type { DateKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Family } from '@/features/family/data'
import { useLang, useT } from '@/lib/lang'
import { dateIn, timeIn } from '@/lib/langFormat'
import { cn } from '@/lib/utils'
import { answerOffer, requestClass, requestError } from './api'
import { ClassPicker } from './ClassPicker'
import { classWhenIn } from './familyText'
import { useClassChoices } from './hooks'

/** What the dialog opens on: a child, and what for (a class to move, a missed class to make up). */
export interface AskPreset {
  studentId?: string
  kind?: ClassRequestKind
  forSessionId?: string | null
  /** The day of the class to move, so it's found however far ahead it is (choices stay within the horizon). */
  forDateKey?: DateKey
}

const missedText = (s: Pick<Session, 'dateKey' | 'startMin' | 'status'>, lang: Lang) =>
  lang === 'ko'
    ? `${dateIn(s.dateKey, 'weekdayMedium', 'ko')} ${timeIn(s.startMin, 'ko')} (${s.status === 'no_show' ? '결석' : '취소'})`
    : `${dateIn(s.dateKey, 'weekdayMedium', 'en')}, ${timeIn(s.startMin, 'en')} (${s.status === 'no_show' ? 'missed' : 'canceled'})`

/** What a request is for, in Korean: 보강, 옮길 수업, 추가 수업. */
const kindKo = (kind: ClassRequestKind) => (kind === 'makeup' ? '보강' : kind === 'reschedule' ? '옮길 수업' : '추가 수업')

/**
 * Parent and Student → Ask for a class: a makeup for a missed class, a class moved to another time, or an extra class,
 * in a class with seats open in the next days (docs/DECISIONS.md §23). Families see how many seats are open, never who's
 * in a class. The academy approves, declines or suggests another time; the family is told each time.
 */
export function AskForClassDialog({ open, onOpenChange, family, preset }: { open: boolean; onOpenChange: (o: boolean) => void; family: Family; preset?: AskPreset }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,48rem)] flex-col gap-0 p-0 sm:max-w-lg" data-testid="ask-for-class">
        {/* Each opening starts afresh from its preset. */}
        {open ? <AskForm family={family} preset={preset} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AskForm({ family, preset, onDone }: { family: Family; preset?: AskPreset; onDone: () => void }) {
  const { branchId } = useBranch()
  const lang = useLang()
  const t = useT()
  const [studentId, setStudentId] = useState(preset?.studentId ?? family.kids[0]?.id ?? '')
  const movingId = preset?.kind === 'reschedule' ? (preset.forSessionId ?? null) : null
  const choice = useClassChoices({ studentId, forSessionId: movingId, seatsUntil: preset?.forDateKey })
  const { seats, pending, since, horizon } = choice

  // Missed classes still to make up, less those an open request is for (the server would refuse a second one).
  const missed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since])
  const owed = useMemo(() => missed.filter((s) => !pending.some((r) => r.forSessionId === s.id)), [missed, pending])
  const moving = movingId ? (seats.data.find((s) => s.id === movingId) ?? null) : null
  const [kind, setKind] = useState<ClassRequestKind>(preset?.kind ?? 'makeup')
  const [forId, setForId] = useState<string | null>(preset?.kind === 'makeup' ? (preset.forSessionId ?? null) : null)
  const [classId, setClassId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // A makeup needs one owed; with none, an extra class is what's left (a move comes only from a class).
  const kindNow: ClassRequestKind = kind === 'makeup' && !owed.length && !seats.loading ? 'extra' : kind
  const makeupFor = kindNow === 'makeup' ? (owed.find((s) => s.id === forId) ?? owed[0] ?? null) : null
  const picked = choice.choices.find((c) => c.id === classId) ?? null
  const ready = !!picked && !!studentId && (kindNow === 'extra' || (kindNow === 'makeup' ? !!makeupFor : !!moving))
  const who = family.who === 'parent' ? family.firstName(studentId) : 'you'

  async function send() {
    if (!picked || !ready) return
    setSending(true)
    try {
      await requestClass({
        branchId,
        studentId,
        kind: kindNow,
        classId: picked.id,
        forSessionId: kindNow === 'extra' ? null : kindNow === 'makeup' ? (makeupFor?.id ?? null) : (moving?.id ?? null),
        message: message.trim(),
      })
      toast.success(t('Request sent', '신청을 보냈어요'), {
        description: t('The academy approves it, declines it or suggests another time, and you’ll be told.', '아카데미가 확인하고 결과를 알려 드려요. 다른 시간을 제안할 수도 있어요.'),
      })
      onDone()
    } catch (e) {
      toast.error(t('The request wasn’t sent', '신청을 보내지 못했어요'), { description: requestError(e, t('Please try again.', '다시 시도해 주세요.')) })
      setSending(false)
    }
  }

  return (
    <>
      <DialogHeader className="border-b px-5 pt-5 pb-4">
        <DialogTitle>{moving ? t('Move a class', '수업 옮기기') : t('Ask for a class', '수업 신청')}</DialogTitle>
        <DialogDescription>
          {moving
            ? t(
                `Choose another time for ${family.who === 'parent' ? `${family.firstName(studentId)}’s` : 'your'} class on ${dateIn(moving.dateKey, 'weekdayMedium', 'en')}. It stays booked until the academy approves the move.`,
                `${family.who === 'parent' ? `${family.firstName(studentId)} 학생의 ` : ''}${dateIn(moving.dateKey, 'weekdayMedium', 'ko')} 수업을 옮길 시간을 골라 주세요. 아카데미가 승인할 때까지 원래 수업은 그대로 있어요.`,
              )
            : t('Choose a time with a seat open. The academy approves each request, or suggests another time.', '빈자리가 있는 시간을 골라 주세요. 아카데미가 신청을 승인하거나 다른 시간을 제안해요.')}
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {family.who === 'parent' && family.kids.length > 1 && !moving ? (
          <div className="space-y-2">
            <Label>{t('For', '자녀')}</Label>
            <div className="flex flex-wrap gap-2">
              {family.kids.map((k) => (
                <Button
                  key={k.id}
                  type="button"
                  size="sm"
                  variant={studentId === k.id ? 'default' : 'outline'}
                  onClick={() => {
                    setStudentId(k.id)
                    setClassId(null)
                    setForId(null)
                  }}
                >
                  {family.firstName(k.id)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {moving ? null : (
          <div className="space-y-2">
            <Label>{t('What for', '신청 종류')}</Label>
            <RadioGroup value={kindNow} onValueChange={(v) => setKind(v as ClassRequestKind)} className="gap-2">
              <label className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', !owed.length && 'opacity-60')}>
                <RadioGroupItem value="makeup" disabled={!owed.length} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t('A makeup', '보강')}</span>
                  <span className="block text-muted-foreground">
                    {seats.loading
                      ? t('Looking for missed classes…', '빠진 수업을 찾고 있어요…')
                      : owed.length
                        ? t(`For a class ${who === 'you' ? 'you' : who} missed.`, family.who === 'parent' ? `${who} 학생이 빠진 수업의 보강이에요.` : '빠진 수업의 보강이에요.')
                        : missed.length
                          ? t('Each missed class has a request open.', '빠진 수업마다 이미 신청한 보강이 있어요.')
                          : t('No missed classes to make up.', '보강할 수업이 없어요.')}
                  </span>
                  {kindNow === 'makeup' && owed.length > 1 ? (
                    <Select value={makeupFor?.id ?? ''} onValueChange={setForId}>
                      <SelectTrigger className="mt-2 w-full" aria-label={t('The class it makes up', '보강할 수업')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {owed.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {missedText(s, lang)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : kindNow === 'makeup' && makeupFor ? (
                    <span className="mt-1 block text-foreground">{missedText(makeupFor, lang)}</span>
                  ) : null}
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <RadioGroupItem value="extra" className="mt-0.5" />
                <span>
                  <span className="font-medium">{t('An extra class', '추가 수업')}</span>
                  <span className="block text-muted-foreground">{t('Extra practice in an open seat.', '빈자리에서 하는 추가 연습이에요.')}</span>
                </span>
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="space-y-2">
          <Label>{t('When', '시간')}</Label>
          <ClassPicker
            choices={choice.choices}
            value={classId}
            onChange={setClassId}
            loading={choice.loading}
            label={t('When', '시간')}
            empty={t(
              `No open seats until ${dateIn(horizon, 'monthDay', 'en')}. Seats open up when students cancel, so check again soon.`,
              `${dateIn(horizon, 'monthDay', 'ko')}까지 빈자리가 없어요. 취소하는 학생이 생기면 자리가 나니 곧 다시 확인해 주세요.`,
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ask-message">{t('Message (optional)', '메시지 (선택)')}</Label>
          <Textarea
            id="ask-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t('Anything the academy should know', '아카데미에 전할 말이 있으면 적어 주세요')}
          />
        </div>
      </div>
      <DialogFooter className="border-t px-5 py-4">
        <Button variant="outline" onClick={onDone} disabled={sending}>
          {t('Cancel', '닫기')}
        </Button>
        <Button onClick={() => void send()} disabled={!ready || sending} data-testid="ask-send">
          <LuCalendarPlus /> {sending ? t('Sending…', '보내는 중…') : t('Send request', '신청 보내기')}
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * The family's answer to a class the academy suggested, when it doesn't suit them: another time, picked as when asking
 * (seats open, none at the same time as their classes), with a message. The request goes back to the academy.
 */
export function AskAnotherDialog({ request, family, onClose }: { request: WithId<ClassRequest> | null; family: Family; onClose: () => void }) {
  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(92dvh,48rem)] flex-col gap-0 p-0 sm:max-w-lg" data-testid="ask-another">
        {request ? <AnotherForm r={request} family={family} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AnotherForm({ r, family, onDone }: { r: WithId<ClassRequest>; family: Family; onDone: () => void }) {
  const { branchId } = useBranch()
  const t = useT()
  const choice = useClassChoices({
    studentId: r.studentId,
    forSessionId: r.kind === 'reschedule' ? r.forSessionId : null,
    requestId: r.id,
    // The class suggested is accepted, not asked for.
    exclude: [r.offer?.classId],
    seatsUntil: r.forDateKey ?? undefined,
  })
  const [classId, setClassId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const picked = choice.choices.find((c) => c.id === classId) ?? null
  const whose = family.who === 'parent' ? `${family.firstName(r.studentId)}’s` : 'your'
  const what = r.kind === 'makeup' ? 'makeup' : r.kind === 'reschedule' ? 'moved class' : 'extra class'

  async function send() {
    if (!picked) return
    setSending(true)
    try {
      await answerOffer(branchId, r.id, 'another', { classId: picked.id, message: message.trim() })
      toast.success(t('Asked for another time', '다른 시간을 신청했어요'), {
        description: t(`${classWhenIn(picked, 'en')}. The academy answers, and you’ll be told.`, `${classWhenIn(picked, 'ko')}. 아카데미가 확인하면 알려 드려요.`),
      })
      onDone()
    } catch (e) {
      toast.error(t('That wasn’t sent', '신청을 보내지 못했어요'), { description: requestError(e, t('Please try again.', '다시 시도해 주세요.')) })
      setSending(false)
    }
  }

  const whoKo = family.who === 'parent' ? `${family.firstName(r.studentId)} 학생 ` : ''
  return (
    <>
      <DialogHeader className="border-b px-5 pt-5 pb-4">
        <DialogTitle>{t('Ask for another time', '다른 시간 신청')}</DialogTitle>
        <DialogDescription>
          {t(
            `${r.offer ? `Instead of ${classWhenIn(r.offer, 'en')}, choose` : 'Choose'} a time with a seat open for ${whose} ${what}. The academy answers, and you’ll be told.`,
            `${r.offer ? `제안받은 ${classWhenIn(r.offer, 'ko')} 대신 ` : ''}${whoKo}${kindKo(r.kind)}에 맞는 빈자리 시간을 골라 주세요. 아카데미가 확인하면 알려 드려요.`,
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="space-y-2">
          <Label>{t('When', '시간')}</Label>
          <ClassPicker
            choices={choice.choices}
            value={classId}
            onChange={setClassId}
            loading={choice.loading}
            label={t('When', '시간')}
            marked={r.offer ? { dateKey: r.offer.dateKey, label: t('Suggested', '제안받은 날') } : null}
            empty={t(
              `No other open seats until ${dateIn(choice.horizon, 'monthDay', 'en')}. Accept the time suggested, or check again soon.`,
              `${dateIn(choice.horizon, 'monthDay', 'ko')}까지 다른 빈자리가 없어요. 제안받은 시간을 수락하거나 곧 다시 확인해 주세요.`,
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="another-message">{t('Message (optional)', '메시지 (선택)')}</Label>
          <Textarea
            id="another-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t('Weekday evenings after 5 work best', '평일 저녁 5시 이후가 좋아요')}
          />
        </div>
      </div>
      <DialogFooter className="border-t px-5 py-4">
        <Button variant="outline" onClick={onDone} disabled={sending}>
          {t('Cancel', '닫기')}
        </Button>
        <Button onClick={() => void send()} disabled={!picked || sending} data-testid="ask-another-send">
          <LuSend /> {sending ? t('Sending…', '보내는 중…') : t('Ask for this time', '이 시간으로 신청')}
        </Button>
      </DialogFooter>
    </>
  )
}
