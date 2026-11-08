import { collection, doc, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useEffect, useMemo, useState } from 'react'
import { LuKeyRound, LuTablet } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL, ROOT } from '@shared/paths'
import { formatInstant } from '@shared/time'
import type { TimestampLike } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { db, functions } from '@/lib/firebase'
import { useDoc, useQuery } from '@/lib/firestore'

interface Tablet {
  name: string
  createdAt: TimestampLike | null
  lastSyncAt: TimestampLike | null
  appVersion: string
}

const saveSetupPin = httpsCallable<{ branchId: string; pin: string }, { ok: boolean }>(functions, 'kioskSetupPin')
const tabletAction = httpsCallable<{ branchId: string; deviceId: string; action: 'rename' | 'remove'; name?: string }, { ok: boolean }>(functions, 'kioskTablet')

/** A tablet syncs every minute: one heard from within this long is online. */
const ONLINE_MS = 3 * 60_000
const ms = (t: TimestampLike | null | undefined) => (t ? t.toDate().getTime() : null)
const errorText = (e: unknown, fallback: string) => (e as { message?: string }).message?.replace(/^.*?: /, '') || fallback

/**
 * The kiosk tablets (functions/src/kiosk.ts, docs/kiosk.md): the setup PIN that registers one, and the tablets
 * registered, with when each was last heard from. A tablet keeps working without the internet and sends its clock-ins
 * when it's back, so "offline" here means its newest clock-ins may not be in yet.
 */
export function KioskTabletsCard() {
  const { branchId, timezone } = useBranch()
  const { confirm, dialog } = useConfirm()
  const statusRef = useMemo(() => doc(db, ROOT.branches, branchId, COL.kioskSetup, 'status'), [branchId])
  const status = useDoc<{ setAt?: TimestampLike; setBy?: string }>(statusRef)
  const tabletsQuery = useMemo(() => query(collection(db, ROOT.branches, branchId, COL.kioskDevices), where('revokedAt', '==', null)), [branchId])
  const tablets = useQuery<Tablet>(tabletsQuery, `kiosk-tablets-${branchId}`)
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const setAt = ms(status.data?.setAt)
  const valid = /^\d{4,8}$/.test(pin) && pin === again

  async function savePin() {
    setBusy(true)
    try {
      await saveSetupPin({ branchId, pin })
      toast.success('Setup PIN saved. Type it on a tablet to register it.')
      setPin('')
      setAgain('')
    } catch (e) {
      toast.error(errorText(e, 'Couldn’t save the setup PIN'))
    } finally {
      setBusy(false)
    }
  }

  async function act(deviceId: string, action: 'rename' | 'remove', name?: string) {
    setBusy(true)
    try {
      await tabletAction({ branchId, deviceId, action, name })
      toast.success(action === 'rename' ? 'Tablet renamed' : 'Tablet removed')
      setRenaming(null)
    } catch (e) {
      toast.error(errorText(e, 'Couldn’t change the tablet'))
    } finally {
      setBusy(false)
    }
  }

  const list = [...tablets.data].sort((a, b) => (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0))

  return (
    <Card data-testid="kiosk-tablets">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuTablet /> Kiosk tablets
        </CardTitle>
        <CardDescription>
          Coaches clock in and out on the tablet at the front desk with their PIN. It keeps working without the internet and sends what it recorded once it’s
          back. To add a tablet, install the Sky Arc Kiosk app on it, then type the setup PIN there.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LuKeyRound className="size-4" /> Setup PIN
            {setAt ? <Badge variant="secondary">Set</Badge> : <Badge variant="outline">Not set</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {setAt
              ? `Set ${formatInstant(setAt, timezone)}${status.data?.setBy ? ` by ${status.data.setBy}` : ''}. Tablets already registered keep working; a tablet’s admin menu opens with the PIN it was registered with.`
              : 'Choose 4 to 8 digits. Only someone with this PIN can register a tablet, or open a tablet’s admin menu.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-40 font-mono tracking-[0.3em]"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              aria-label="New setup PIN"
              placeholder="New PIN"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
            <Input
              className="w-40 font-mono tracking-[0.3em]"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              aria-label="The setup PIN again"
              placeholder="Again"
              maxLength={8}
              value={again}
              onChange={(e) => setAgain(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
            <Button disabled={busy || !valid} onClick={() => void savePin()}>
              {busy ? <Spinner /> : null} {setAt ? 'Change setup PIN' : 'Set setup PIN'}
            </Button>
          </div>
          {pin.length >= 4 && again.length >= pin.length && pin !== again ? <p className="text-sm text-destructive">The two PINs don’t match.</p> : null}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Registered tablets</div>
          {tablets.loading ? (
            <Spinner />
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {list.map((t) => {
                const last = ms(t.lastSyncAt)
                const online = last !== null && now - last < ONLINE_MS
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid="kiosk-tablet">
                    {renaming?.id === t.id ? (
                      <Input
                        className="h-8 w-56"
                        aria-label="Tablet name"
                        maxLength={60}
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && renaming.name.trim() && void act(t.id, 'rename', renaming.name)}
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{t.name}</span>
                    )}
                    {online ? <Badge variant="secondary">Online</Badge> : <Badge variant="outline">Offline</Badge>}
                    <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                      {last ? `Last heard from ${formatInstant(last, timezone)}` : 'Not heard from yet'}
                      {t.appVersion ? ` · app ${t.appVersion}` : ''}
                    </span>
                    {renaming?.id === t.id ? (
                      <>
                        <Button size="sm" disabled={busy || !renaming.name.trim()} onClick={() => void act(t.id, 'rename', renaming.name)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRenaming({ id: t.id, name: t.name })}>
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={async () =>
                            (await confirm({
                              title: `Remove “${t.name}”?`,
                              description:
                                'The tablet stops syncing at once: coaches can’t clock in on it until it’s registered again with the setup PIN. Clock-ins it hasn’t sent yet stay on it and go in once it’s registered again.',
                              confirmLabel: 'Remove tablet',
                              destructive: true,
                            })) && void act(t.id, 'remove')
                          }
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>
      {dialog}
    </Card>
  )
}
