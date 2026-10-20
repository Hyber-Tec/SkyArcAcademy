import { type ReactNode, Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LuLoaderCircle } from 'react-icons/lu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { TRIAL } from '@/site/kit/content'
import { useMedia, useSite } from '@/site/kit/site'
import { T } from './i18n'
import { useWizard } from './wizard-state'

// The form's code loads after the page has settled (it's ready long before anyone opens it).
const loadWizard = () => import('./components/TrialWizard')
const TrialWizard = lazy(() => loadWizard().then((m) => ({ default: m.TrialWizard })))

/**
 * Every "Book a trial" button opens the trial drawer over the page (right side on desktops, a bottom sheet on phones),
 * without leaving the page. It remembers a half-filled request until it's sent.
 */
interface BookingApi {
  openBooking: () => void
}

const Ctx = createContext<BookingApi | null>(null)

export function BookingProvider({ children }: { children: ReactNode }) {
  const { lang, t } = useSite()
  const [open, setOpen] = useState(false)
  const phone = useMedia('(max-width: 767px)')
  const wizard = useWizard(lang)

  useEffect(() => {
    const timer = setTimeout(() => void loadWizard().catch(() => undefined), 2500)
    return () => clearTimeout(timer)
  }, [])

  const openBooking = useCallback(() => {
    if (wizard.state.step === 'done') wizard.dispatch({ type: 'reset', language: lang, keepParent: true })
    setOpen(true)
  }, [wizard, lang])
  const api = useMemo(() => ({ openBooking }), [openBooking])

  return (
    <Ctx.Provider value={api}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={phone ? 'bottom' : 'right'}
          showCloseButton={false}
          className={
            phone
              ? 'h-[92dvh] gap-0 overflow-hidden rounded-t-[28px] border-0 bg-white p-0 data-[side=bottom]:h-[92dvh]'
              : 'gap-0 overflow-hidden border-l-0 bg-white p-0 shadow-2xl data-[side=right]:w-full data-[side=right]:sm:max-w-[540px]'
          }
          aria-describedby="booking-drawer-desc"
        >
          <SheetTitle className="sr-only">{t(T.wizardTitle)}</SheetTitle>
          <SheetDescription id="booking-drawer-desc" className="sr-only">
            {t(TRIAL.text)}
          </SheetDescription>
          {phone ? <span className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-line" aria-hidden="true" /> : null}
          <Suspense
            fallback={
              <div className="flex flex-1 items-center justify-center text-stone">
                <LuLoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              </div>
            }
          >
            <TrialWizard wizard={wizard} variant="drawer" onClose={() => setOpen(false)} />
          </Suspense>
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  )
}

export function useBooking(): BookingApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useBooking outside BookingProvider')
  return v
}
