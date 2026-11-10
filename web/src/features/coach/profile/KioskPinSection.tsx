import { httpsCallable } from '@/lib/callable'
import { useState } from 'react'
import { LuCheck } from 'react-icons/lu'
import { toast } from 'sonner'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { SectionTitle } from '@/features/profile/ProfileLayout'
import { functions } from '@/lib/firebase'
import { NOT_LINKED, useMyStaff } from '../hooks'

const setMyKioskPin = httpsCallable<{ branchId: string; pin: string; via: 'web' }, { ok: boolean }>(functions, 'setMyKioskPin')

/** Digits shown as dots, without a password manager offering to save them (a PIN isn't a password). */
const pinInput = 'w-40 font-mono tracking-[0.4em] [-webkit-text-security:disc]'

/**
 * Profile → Kiosk PIN: the coach sets or changes the PIN they clock in and out with on the front desk's tablet, typed
 * twice (the fourth meeting's B2; the phone app's More has the same). The server keeps it unique and stores only its
 * hash; the office can still set or remove it in Employees.
 */
export function KioskPinSection() {
  const { branchId, settings, viewAs } = useBranch()
  const { data: staff, loading } = useMyStaff()
  const len = settings.timeClock.kiosk.pinLength
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />
  if (!staff) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, len)
  const mismatch = again.length === len && pin.length === len && again !== pin
  const ready = pin.length === len && again === pin

  async function save() {
    if (!ready) return
    setBusy(true)
    try {
      await setMyKioskPin({ branchId, pin, via: 'web' })
      setPin('')
      setAgain('')
      setSavedAt(Date.now())
      toast.success('Your kiosk PIN is saved', { description: 'The tablet takes it within a minute.' })
    } catch (e) {
      toast.error('Couldn’t save your PIN', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <SectionTitle title="Kiosk PIN" description="You type it on the front desk’s tablet to clock in and out." />
      <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="pin-title">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h3 id="pin-title" className="text-sm font-semibold">
              {staff.hasKioskPin ? 'Change your PIN' : 'Set your PIN'}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {len} digits. It’s stored encrypted, so nobody can look it up, the office included. Forgot it? Set a new one here.
            </p>
          </div>
          {staff.hasKioskPin ? <Badge variant="secondary">Set</Badge> : <Badge variant="outline">Not set</Badge>}
        </div>
        {viewAs ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">You’re viewing the app as {staff.name}. Only they can set their PIN here; admins can in Employees.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <FieldGroup className="gap-5 p-5">
              <div className="flex flex-wrap gap-5">
                <Field className="w-auto">
                  <FieldLabel htmlFor="pin-new">New PIN</FieldLabel>
                  <Input
                    id="pin-new"
                    className={pinInput}
                    inputMode="numeric"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    maxLength={len}
                    placeholder={'•'.repeat(len)}
                    value={pin}
                    onChange={(e) => {
                      setSavedAt(null)
                      setPin(digits(e.target.value))
                    }}
                    data-testid="pin-new"
                  />
                </Field>
                <Field className="w-auto" data-invalid={mismatch || undefined}>
                  <FieldLabel htmlFor="pin-again">Type it again</FieldLabel>
                  <Input
                    id="pin-again"
                    className={pinInput}
                    inputMode="numeric"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    maxLength={len}
                    placeholder={'•'.repeat(len)}
                    value={again}
                    aria-invalid={mismatch || undefined}
                    onChange={(e) => {
                      setSavedAt(null)
                      setAgain(digits(e.target.value))
                    }}
                    data-testid="pin-again"
                  />
                  {mismatch ? <FieldError>The two PINs don’t match.</FieldError> : null}
                </Field>
              </div>
            </FieldGroup>
            <div className="flex items-center justify-end gap-3 border-t bg-muted/30 px-5 py-3">
              {savedAt ? (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <LuCheck className="size-4 text-emerald-600" /> Saved
                </span>
              ) : null}
              <Button type="submit" disabled={!ready || busy} data-testid="pin-save">
                {busy ? <Spinner /> : null} Save PIN
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
