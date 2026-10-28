import { useMemo, useState } from 'react'
import { LuCheck, LuKeyRound, LuMail } from 'react-icons/lu'
import { toast } from 'sonner'
import { emailKey } from '@shared/paths'
import { formatPhone, parentLabel } from '@shared/people'
import { ROLE_LABELS } from '@shared/roles'
import { formatInstant } from '@shared/time'
import type { Member, Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { giveParentAccess } from '@/features/access/api'
import { useMembers } from '@/features/data/hooks'
import { Avatar } from './IdentityColumn'

/**
 * The student page's Family (admins): the parents and guardians on file, and who can sign in to see the student
 * (the manager's second meeting, F1: two parents, each with their own login). A contact with an email gets access in
 * one click; a parent's login that isn't on file shows too. A name is optional (F3): "Avery's parent".
 */
export function FamilyCard({ student, priv, onEdit }: { student: WithId<Student>; priv: StudentPrivateProfile | null; onEdit: () => void }) {
  const { branchId, actor, timezone } = useBranch()
  const members = useMembers()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const first = student.firstName || student.name.split(' ')[0]
  const byEmail = useMemo(() => new Map(members.data.map((m) => [m.id, m])), [members.data])
  const contacts = priv?.parents ?? []
  const onFile = new Set(contacts.map((p) => emailKey(p.email)).filter(Boolean))
  // Parents who sign in for this student but aren't among the contacts.
  const extra = members.data.filter((m) => m.role === 'parent' && (m.studentIds ?? []).includes(student.id) && !onFile.has(m.id))

  async function give(email: string, name: string, existing: WithId<Member> | null) {
    const who = name || email
    const ok = await confirm({
      title: existing ? `Let ${who} see ${first} too?` : `Give ${who} access?`,
      description: existing
        ? `${who} already signs in for another child; ${first} is added to what they see.`
        : `${email} gets an email to sign in, then sees ${first}’s classes, scores and reports, on the website and the phone app.`,
      confirmLabel: 'Give access',
    })
    if (!ok) return
    setBusy(email)
    try {
      await giveParentAccess({ branchId, actor, email, name, student: { id: student.id, name: student.name }, existing })
      toast.success('Access given', { description: existing ? `${who} now sees ${first} too.` : `The sign-in email is on its way to ${email}.` })
    } catch (e) {
      toast.error('Not given', { description: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const status = (m: WithId<Member> | undefined) => {
    if (!m) return null
    if (m.role !== 'parent') return <span className="text-xs text-muted-foreground">Signs in as {ROLE_LABELS[m.role]}</span>
    if (!(m.studentIds ?? []).includes(student.id) || m.status !== 'active') return null
    const seen = m.lastLoginAt ? `signed in ${formatInstant(m.lastLoginAt.toDate(), timezone, { dateStyle: 'medium' })}` : 'not signed in yet'
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" title={`Can sign in; ${seen}`}>
        <LuCheck className="size-3.5" /> Can sign in
      </span>
    )
  }

  return (
    <div className="hidden rounded-xl border bg-card p-4 lg:block" data-testid="family-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Family</h2>
        <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onEdit}>
          Edit
        </button>
      </div>
      {contacts.length || extra.length ? (
        <ul className="space-y-3">
          {contacts.map((p, i) => {
            const key = emailKey(p.email)
            const m = key ? byEmail.get(key) : undefined
            const linked = m?.role === 'parent' && (m.studentIds ?? []).includes(student.id) && m.status === 'active'
            const name = p.name || parentLabel(null, first)
            return (
              <li key={i} className="flex items-start gap-3">
                <Avatar name={p.name || p.email || '?'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name || p.email || name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[p.relation, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(' · ') || (p.name ? p.email : '')}
                  </div>
                  <div className="mt-1">
                    {status(m)}
                    {key && !linked && (!m || m.role === 'parent') ? (
                      <Button variant="outline" size="xs" disabled={busy === p.email || members.loading} onClick={() => void give(p.email, p.name, m ?? null)} data-testid="give-access">
                        <LuKeyRound /> Give access
                      </Button>
                    ) : null}
                  </div>
                </div>
                {p.email ? (
                  <a className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" href={`mailto:${p.email}`} aria-label={`Email ${name}`}>
                    <LuMail className="size-4" />
                  </a>
                ) : null}
              </li>
            )
          })}
          {extra.map((m) => (
            <li key={m.id} className="flex items-start gap-3">
              <Avatar name={m.displayName || m.email} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{parentLabel(m.displayName, first)}</div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                <div className="mt-1">{status(m)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No parents or guardians yet.</p>
      )}
      {dialog}
    </div>
  )
}
