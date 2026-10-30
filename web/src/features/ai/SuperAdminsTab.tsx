import { useState } from 'react'
import { LuTrash2, LuUserPlus } from 'react-icons/lu'
import { toast } from 'sonner'
import { looksLikeEmail } from '@shared/auth'
import { emailKey } from '@shared/paths'
import { formatInstant } from '@shared/time'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { callError, setSuperAdmin, useSuperAdmins } from './api'

/**
 * AI → Super admins: who may open this page (and the phone's "View the app as"). Adding or removing one goes through
 * Cloud Functions (aiSetSuperAdmin), which keep at least one and write the history. It gives no access to academy data.
 */
export function SuperAdminsTab() {
  const { timezone } = useBranch()
  const { email: me } = useAuth()
  const { confirm, dialog } = useConfirm()
  const { data, loading } = useSuperAdmins()
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const admins = [...data].sort((a, b) => a.email.localeCompare(b.email))

  async function add() {
    const email = emailKey(adding)
    if (!looksLikeEmail(email)) return void toast.error('That doesn’t look like an email address.')
    if (admins.some((a) => a.email === email)) return void toast.info(`${email} is already a super admin.`)
    const ok = await confirm({
      title: `Make ${email} a super admin?`,
      description: 'When they sign in with that email they’ll see this page (the keys’ last 4 characters, the models, the spend and every request) and can change all of it, add or remove super admins, and on the phone view the app as anyone in the academy.',
      confirmLabel: 'Make super admin',
    })
    if (!ok) return
    setBusy('add')
    try {
      await setSuperAdmin(email, true)
      toast.success(`${email} is a super admin`)
      setAdding('')
    } catch (e) {
      toast.error('Couldn’t add them', { description: callError(e) })
    } finally {
      setBusy(null)
    }
  }

  async function remove(email: string) {
    const self = email === me
    const ok = await confirm({
      title: self ? 'Remove yourself as a super admin?' : `Remove ${email} as a super admin?`,
      description: self ? 'You’ll lose this page at once; another super admin can add you back.' : 'They lose this page at once. Their other access to the app stays as it is.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    setBusy(email)
    try {
      await setSuperAdmin(email, false)
      toast.success(`${email} is no longer a super admin`)
    } catch (e) {
      toast.error('Couldn’t remove them', { description: callError(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Super admins</CardTitle>
        <CardDescription>
          The people who see this page, by the email they sign in with (the phone app’s “View the app as” is theirs too). It’s HyberTec’s, not the academy’s: being a super admin gives no access to the academy’s data. There’s always at least one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="ai-super-admins">
            {admins.map((a) => {
              const at = (a.addedAt as { toMillis?: () => number } | null)?.toMillis?.()
              const last = admins.length <= 1
              const button = (
                <Button variant="ghost" size="sm" disabled={!!busy || last} onClick={() => void remove(a.email)} aria-label={`Remove ${a.email}`}>
                  {busy === a.email ? <Spinner /> : <LuTrash2 />} Remove
                </Button>
              )
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="truncate">{a.email}</span>
                      {a.email === me ? <Badge variant="secondary">You</Badge> : null}
                    </div>
                    {at || a.addedBy ? (
                      <div className="text-xs text-muted-foreground">
                        Added{at ? ` ${formatInstant(at, timezone, { dateStyle: 'medium' })}` : ''}
                        {a.addedBy?.name || a.addedBy?.email ? ` by ${a.addedBy.name || a.addedBy.email}` : ''}
                      </div>
                    ) : null}
                  </div>
                  {last ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>{button}</span>
                      </TooltipTrigger>
                      <TooltipContent>There must always be a super admin: add another one first.</TooltipContent>
                    </Tooltip>
                  ) : (
                    button
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input type="email" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="name@example.com" aria-label="Email of the new super admin" autoComplete="off" className="sm:max-w-sm" />
          <Button type="submit" variant="outline" disabled={!!busy || !adding.trim()}>
            {busy === 'add' ? <Spinner /> : <LuUserPlus />} Add a super admin
          </Button>
        </form>
      </CardContent>
      {dialog}
    </Card>
  )
}
