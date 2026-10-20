import { useMemo, useState } from 'react'
import type { IconType } from 'react-icons'
import { LuCalendarDays, LuCheck, LuInbox, LuLanguages, LuMail, LuPhone, LuReply, LuRotateCcw, LuTag, LuTrash2, LuUserRound } from 'react-icons/lu'
import { toast } from 'sonner'
import { addDays, dateKeyOf, formatInstant, formatInstantTime, todayKey } from '@shared/time'
import type { TimestampLike, WithId } from '@shared/types'
import { CONTACT_TOPIC_LABELS, type ContactTopic, TRIAL_EXPERIENCE_LABELS, type TrialExperience } from '@shared/website/messages'
import type { WebsiteMessage } from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMembers } from '@/features/data/hooks'
import { cn } from '@/lib/utils'
import { deleteMessage, setMessageStatus } from './api'
import { IconAction } from './parts'

const LANGUAGES: Record<string, string> = { en: 'English', ko: 'Korean' }

const isDone = (m: WebsiteMessage) => m.status === 'done'

function kindLabel(m: WebsiteMessage): string {
  return m.kind === 'trial' ? 'Trial request' : 'Question'
}

/** "Today, 4:02 PM", "Yesterday, 9:15 AM", or the date and time, in the academy's time zone. */
function when(t: TimestampLike | null | undefined, timezone: string): string {
  if (!t) return 'Just now'
  const d = t.toDate()
  const day = dateKeyOf(d, timezone)
  const today = todayKey(timezone)
  if (day === today) return `Today, ${formatInstantTime(d, timezone)}`
  if (day === addDays(today, -1)) return `Yesterday, ${formatInstantTime(d, timezone)}`
  return formatInstant(d, timezone, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Trial requests and questions sent from the website, newest first. The office replies by email (in the language the
 * family wrote in), then marks each one done.
 */
export function MessagesTab({ messages, loading }: { messages: WithId<WebsiteMessage>[]; loading: boolean }) {
  const [show, setShow] = useState<'new' | 'done'>('new')
  const { data: members } = useMembers()
  const names = useMemo(() => new Map(members.map((m) => [m.email, m.displayName || m.email])), [members])
  const counts = { new: messages.filter((m) => !isDone(m)).length, done: messages.filter(isDone).length }
  const rows = messages.filter((m) => (show === 'done' ? isDone(m) : !isDone(m)))

  return (
    <div className="max-w-4xl space-y-4">
      <ToggleGroup type="single" variant="outline" size="sm" value={show} onValueChange={(v) => v && setShow(v as 'new' | 'done')} aria-label="Show">
        <ToggleGroupItem value="new" className="px-3">
          New <span className="ml-1 text-muted-foreground tabular-nums">{counts.new}</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="done" className="px-3">
          Done <span className="ml-1 text-muted-foreground tabular-nums">{counts.done}</span>
        </ToggleGroupItem>
      </ToggleGroup>
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuInbox />
            </EmptyMedia>
            <EmptyTitle>{show === 'done' ? 'Nothing marked done yet' : messages.length ? 'Nothing new' : 'No messages yet'}</EmptyTitle>
            <EmptyDescription>
              {show === 'done'
                ? 'Messages you mark done move here.'
                : 'Trial requests and questions sent from the website arrive here, and owners and admins get a notification.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <MessageCard key={m.id} m={m} doneByName={m.doneBy ? (names.get(m.doneBy) ?? m.doneBy) : null} />
          ))}
        </div>
      )}
    </div>
  )
}

function Detail({ icon: Icon, label, children, className }: { icon: IconType; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 gap-2.5', className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}

function MessageCard({ m, doneByName }: { m: WithId<WebsiteMessage>; doneByName: string | null }) {
  const { branchId, actor, branch, timezone } = useBranch()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState(false)
  const done = isDone(m)
  const trial = m.kind === 'trial'
  const topic = CONTACT_TOPIC_LABELS[m.topic as ContactTopic] ?? m.topic
  const subject = trial ? `Your trial class at ${branch.name}` : `Your question to ${branch.name}${topic ? ` (${topic})` : ''}`
  const athlete = m.athlete
  const grade = athlete ? (athlete.grade === 'other' ? 'Other grade' : `Grade ${athlete.grade}`) : ''

  async function toggle() {
    setBusy(true)
    try {
      await setMessageStatus(branchId, actor, m, done ? 'new' : 'done')
      toast.success(done ? 'Marked as new.' : 'Marked done.')
    } catch (e) {
      toast.error('It couldn’t be changed', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${m.name || 'this person'}’s ${trial ? 'trial request' : 'question'}?`,
      description: 'It’s deleted for good, for every owner and admin. Reply first if it still needs an answer.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteMessage(branchId, actor, m)
      toast.success('Deleted.')
    } catch (e) {
      toast.error('It couldn’t be deleted', { description: (e as Error).message })
    }
  }

  return (
    <Card className={cn('gap-0 py-0', !done && 'border-l-[3px] border-l-brand')} data-testid="website-message">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Badge variant={trial ? 'default' : 'secondary'}>{kindLabel(m)}</Badge>
            <span>{when(m.createdAt, timezone)}</span>
          </div>
          <h3 className="mt-1.5 text-base font-semibold break-words">{m.name || 'No name given'}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" asChild>
            <a href={`mailto:${m.email}?subject=${encodeURIComponent(subject)}`}>
              <LuReply /> Reply
            </a>
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle()}>
            {done ? <LuRotateCcw /> : <LuCheck />} {done ? 'Mark as new' : 'Mark done'}
          </Button>
          <IconAction icon={LuTrash2} label="Delete" danger onClick={() => void remove()} />
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-3 px-4 pb-4 text-sm sm:grid-cols-2">
        <Detail icon={LuMail} label="Email">
          <a href={`mailto:${m.email}?subject=${encodeURIComponent(subject)}`} className="break-all underline-offset-2 hover:underline">
            {m.email}
          </a>
        </Detail>
        <Detail icon={LuPhone} label="Phone">
          {m.phone ? (
            <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`} className="underline-offset-2 hover:underline">
              {m.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">Not given</span>
          )}
        </Detail>
        <Detail icon={LuLanguages} label="Reply in">
          {LANGUAGES[m.lang] ?? 'English'}
        </Detail>
        {trial ? null : (
          <Detail icon={LuTag} label="About">
            {topic || <span className="text-muted-foreground">Not given</span>}
          </Detail>
        )}
        {trial && athlete ? (
          <Detail icon={LuUserRound} label="Athlete">
            <span className="font-medium">
              {athlete.firstName} {athlete.lastName}
            </span>
            <span className="text-muted-foreground">
              {' '}
              · {grade} · {TRIAL_EXPERIENCE_LABELS[athlete.experience as TrialExperience] ?? athlete.experience}
            </span>
          </Detail>
        ) : null}
        {trial ? (
          <Detail icon={LuCalendarDays} label="Days that suit them" className="sm:col-span-2">
            {m.days?.length ? (
              <ul className="mt-0.5 flex flex-wrap gap-1.5">
                {m.days.map((d) => (
                  <li key={d}>
                    <Badge variant="outline" className="h-auto py-0.5 font-normal whitespace-normal">
                      {d}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">Not given</span>
            )}
          </Detail>
        ) : null}
      </div>
      {m.message ? (
        <div className="border-t px-4 py-3">
          <p className="text-sm break-words whitespace-pre-wrap">{m.message}</p>
        </div>
      ) : null}
      {done ? (
        <div className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          Done{doneByName ? ` by ${doneByName}` : ''}
          {m.doneAt ? ` · ${when(m.doneAt, timezone)}` : ''}
        </div>
      ) : null}
      {dialog}
    </Card>
  )
}
