import { serverTimestamp, setDoc } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { type NoticeKey, type NoticePrefs, noticeOn, noticeSwitchesFor } from '@shared/notices'
import { COL } from '@shared/paths'
import { useBranch } from '@/branch/BranchProvider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { branchDocRef, useDoc } from '@/lib/firestore'

/**
 * A parent's, a student's or the office's notification switches (shared/src/notices.ts): each kind of notice on or off,
 * for the website's bell and the phone alike. Saved as soon as it's flipped. Coaches have theirs in Profile.
 */
export function NoticeSwitches() {
  const { branchId, member, actor } = useBranch()
  const role = member?.role ?? 'parent'
  const ref = useMemo(() => branchDocRef(branchId, COL.notificationPrefs, actor.email), [branchId, actor.email])
  const prefs = useDoc<NoticePrefs>(ref)
  const [pending, setPending] = useState<Partial<Record<NoticeKey, boolean>>>({})
  const switches = noticeSwitchesFor(role)

  async function flip(key: NoticeKey, on: boolean) {
    setPending((p) => ({ ...p, [key]: on }))
    try {
      await setDoc(ref, { [key]: on, updatedAt: serverTimestamp() }, { merge: true })
    } catch {
      toast.error('Not saved', { description: 'Please try again.' })
    } finally {
      setPending((p) => {
        const next = { ...p }
        delete next[key]
        return next
      })
    }
  }

  return (
    <ul className="divide-y rounded-xl border bg-card" data-testid="notice-switches">
      {switches.map((s) => {
        const on = pending[s.key] ?? noticeOn(prefs.data, s.key)
        return (
          <li key={s.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <label htmlFor={`notice-${s.key}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="block text-sm font-medium">{s.label}</span>
              <span className="block text-sm text-muted-foreground">{s.help}</span>
            </label>
            <Switch id={`notice-${s.key}`} checked={on} disabled={prefs.loading} onCheckedChange={(v) => void flip(s.key, v)} />
          </li>
        )
      })}
    </ul>
  )
}

/** The office's switches, from the account menu. */
export function NoticeSwitchesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>What you're told about, in the bell and on your phone.</DialogDescription>
        </DialogHeader>
        <NoticeSwitches />
      </DialogContent>
    </Dialog>
  )
}
