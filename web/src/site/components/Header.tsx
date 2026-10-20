import { NavigationMenu } from 'radix-ui'
import { useEffect, useState } from 'react'
import { LuArrowRight, LuChevronDown, LuChevronRight, LuLogIn, LuMail, LuMapPin, LuMenu, LuUserRound, LuX } from 'react-icons/lu'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { seemsSignedIn } from '@/lib/signedInHint'
import { cn } from '@/lib/utils'
import { ACADEMY, LEVELS, type Lang, PROGRAMS, UI } from '@/site/kit/content'
import { usePlacePhoto, useSiteData } from '@/site/data'
import { Photo } from '@/site/kit/Photo'
import { A, useSite } from '@/site/kit/site'
import { useBooking } from '../booking-context'
import { T } from '../i18n'
import { BookButton, Container } from './bits'

/** The language switch: "EN | 한국어", the page stays the same. */
export function LangSwitch({ tone = 'ink', className }: { tone?: 'ink' | 'light'; className?: string }) {
  const { t, lang, setLang } = useSite()
  const item = (l: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      lang={l}
      className={cn(
        'inline-flex min-h-9 items-center rounded-md px-1.5 transition focus-visible:ring-2 focus-visible:outline-none',
        tone === 'light' ? 'focus-visible:ring-white/50' : 'focus-visible:ring-ink/30',
        lang === l ? (tone === 'light' ? 'font-semibold text-white' : 'font-semibold text-ink') : tone === 'light' ? 'text-white/55 hover:text-white' : 'text-stone hover:text-ink',
      )}
    >
      {label}
    </button>
  )
  return (
    <div role="group" aria-label={t(UI.language)} className={cn('inline-flex items-center', className)}>
      {item('en', 'EN')}
      <span className={cn('mx-0.5 h-3.5 w-px', tone === 'light' ? 'bg-white/25' : 'bg-ink/20')} aria-hidden="true" />
      {item('ko', '한국어')}
    </div>
  )
}

const navLink =
  'inline-flex h-10 items-center rounded-full px-3.5 text-[15px] font-medium text-ink/80 transition hover:bg-warm hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:outline-none aria-[current=page]:text-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-3.5 aria-[current=page]:after:-bottom-[15px] aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-ink relative'

function ProgramsMenu() {
  const { t, href } = useSite()
  const photo = usePlacePhoto('menu')
  return (
    <NavigationMenu.Item>
      <NavigationMenu.Trigger className={cn(navLink, 'group gap-1 data-[state=open]:bg-warm data-[state=open]:text-ink')}>
        {t(UI.programs)}
        <LuChevronDown className="size-4 transition duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
      </NavigationMenu.Trigger>
      <NavigationMenu.Content className="absolute top-full left-0 mt-3.5 w-[780px] rounded-[26px] border border-line bg-white p-3 shadow-float data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out data-[state=open]:slide-in-from-top-1">
        <div className="grid grid-cols-[1.35fr_1fr] gap-3">
          <div className="p-2">
            <p className="px-3 pt-1 pb-2 text-[12px] font-medium tracking-[0.14em] text-stone uppercase">{t(T.levelsMenu)}</p>
            <ul className="grid gap-1">
              {LEVELS.map((lv, i) => (
                <li key={lv.id}>
                  <NavigationMenu.Link asChild>
                    <a href={href(`programs?section=levels&level=${lv.id}`)} className="group/l flex items-start gap-3.5 rounded-2xl px-3 py-2.5 transition hover:bg-warm focus-visible:bg-warm focus-visible:outline-none">
                      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[12px] text-stone group-hover/l:border-ink group-hover/l:bg-ink group-hover/l:text-white">{String(i + 1).padStart(2, '0')}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-ink">{t(lv.name)}</span>
                          <span className="rounded-full bg-warm-2 px-2 py-0.5 text-[11px] font-medium text-stone">{t(lv.stage)}</span>
                        </span>
                        <span className="mt-0.5 block text-[13.5px] text-stone">{t(lv.headline)}</span>
                      </span>
                    </a>
                  </NavigationMenu.Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col overflow-hidden rounded-[20px] bg-warm">
            {photo ? (
              <div className="relative h-36 overflow-hidden">
                <Photo photo={photo} alt="" sizes="300px" className="size-full" />
              </div>
            ) : null}
            <div className="flex flex-1 flex-col gap-1 p-3">
              <NavigationMenu.Link asChild>
                <a href={href('programs?section=tuition')} className="rounded-xl px-2.5 py-2 transition hover:bg-white focus-visible:bg-white focus-visible:outline-none">
                  <span className="block text-[14px] font-semibold text-ink">{t(T.tuitionMenu)}</span>
                  <span className="block text-[12.5px] text-stone">{t(T.tuitionMenuText)}</span>
                </a>
              </NavigationMenu.Link>
              <NavigationMenu.Link asChild>
                <a href={href('programs?section=pathways')} className="rounded-xl px-2.5 py-2 transition hover:bg-white focus-visible:bg-white focus-visible:outline-none">
                  <span className="block text-[14px] font-semibold text-ink">{t(T.pathwaysMenu)}</span>
                  <span className="block text-[12.5px] text-stone">{t(T.pathwaysMenuText)}</span>
                </a>
              </NavigationMenu.Link>
              <NavigationMenu.Link asChild>
                <a href={href('programs')} className="mt-auto inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[14px] font-semibold text-ink hover:underline focus-visible:underline focus-visible:outline-none">
                  {t(T.allPrograms)} <LuArrowRight className="size-4" />
                </a>
              </NavigationMenu.Link>
            </div>
          </div>
        </div>
        <p className="mx-2 mt-2 mb-1 rounded-xl px-3 py-2 text-[12.5px] text-stone">{t(PROGRAMS.overview.note)}</p>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  )
}

const LINKS = [
  { to: 'about', label: UI.about },
  { to: 'gallery', label: UI.gallery },
  { to: 'news', label: UI.news },
  { to: 'contact', label: UI.contact },
]

/** "Log in", or "Open the app" on a browser that's signed in to the app. */
function useLoginLabel() {
  const { t } = useSite()
  const [signedIn] = useState(seemsSignedIn)
  return t(signedIn ? UI.openApp : UI.login)
}

function MobileMenu() {
  const { t, href } = useSite()
  const { openBooking } = useBooking()
  const { contact } = useSiteData()
  const login = useLoginLabel()
  const [open, setOpen] = useState(false)
  const row = 'flex min-h-12 items-center justify-between rounded-xl px-3 text-[16px] font-medium text-ink transition hover:bg-warm focus-visible:bg-warm focus-visible:outline-none aria-[current=page]:bg-warm'
  const explore = [
    { to: '', label: UI.home },
    { to: 'programs', label: UI.programs },
    { to: 'programs?section=tuition', label: UI.tuition },
    { to: 'about', label: UI.about },
    { to: 'about?section=coaches', label: UI.coaches },
    { to: 'gallery', label: UI.gallery },
    { to: 'news', label: UI.news },
    { to: 'contact', label: UI.contact },
  ]
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} aria-label={t(T.openMenu)} aria-expanded={open} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-ink transition hover:bg-warm focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:outline-none lg:hidden">
        <LuMenu className="size-5" />
      </button>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-l-0 bg-white p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[420px]" aria-describedby="menu-desc">
        <SheetTitle className="sr-only">{t(UI.menu)}</SheetTitle>
        <SheetDescription id="menu-desc" className="sr-only">
          {ACADEMY.name}
        </SheetDescription>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <SkyArcLogo tone="black" className="h-9" />
          <SheetClose className="inline-flex size-11 items-center justify-center rounded-full text-ink transition hover:bg-warm focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:outline-none" aria-label={t(UI.close)}>
            <LuX className="size-5" />
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-1.5 text-[12px] font-medium tracking-[0.14em] text-stone uppercase">{t(T.explore)}</p>
          <nav aria-label={t(T.mainNav)} className="grid gap-0.5">
            {explore.map((l) => (
              <A key={l.to} to={l.to} className={row} onClick={() => setOpen(false)}>
                {t(l.label)}
                <LuChevronRight className="size-4 text-stone" aria-hidden="true" />
              </A>
            ))}
          </nav>
          <p className="mt-6 px-3 pb-1.5 text-[12px] font-medium tracking-[0.14em] text-stone uppercase">{t(T.families)}</p>
          <div className="grid gap-0.5">
            <A to="portal" className={row} onClick={() => setOpen(false)}>
              {t(UI.portal)}
              <LuChevronRight className="size-4 text-stone" aria-hidden="true" />
            </A>
            <a href={ACADEMY.loginUrl} className={row}>
              {login}
              <LuChevronRight className="size-4 text-stone" aria-hidden="true" />
            </a>
          </div>
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-warm px-4 py-2">
            <span className="text-[14px] text-stone">{t(UI.language)}</span>
            <LangSwitch className="text-[15px]" />
          </div>
          <div className="mt-6 space-y-2 px-3 text-[14px] text-stone">
            <p className="flex items-start gap-2">
              <LuMapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {ACADEMY.street}, {ACADEMY.city}
            </p>
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-2 break-all hover:text-ink">
                <LuMail className="size-4 shrink-0" aria-hidden="true" />
                {contact.email}
              </a>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setTimeout(() => openBooking(), 220)
            }}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-red px-6 text-[15px] font-semibold text-white transition hover:bg-red-deep focus-visible:ring-2 focus-visible:ring-red/40 focus-visible:outline-none"
          >
            {t(UI.trial)}
          </button>
          <a href={href('trial')} onClick={() => setOpen(false)} className="mt-2 flex min-h-11 items-center justify-center text-[14px] font-medium text-stone hover:text-ink">
            {t(T.aboutTrials)}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function Header() {
  const { t, href } = useSite()
  const login = useLoginLabel()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 44)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <>
      <button
        type="button"
        onClick={() => document.getElementById('main')?.focus()}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2.5 focus:text-[14px] focus:font-semibold focus:text-white"
      >
        {t(T.skip)}
      </button>
      <div className="hidden bg-ink text-white sm:block">
        <Container className="flex h-10 items-center justify-between gap-4 text-[13px]">
          <p className="flex min-w-0 items-center gap-2.5 truncate text-white/80">
            <span className="size-1.5 shrink-0 rounded-full bg-dot" aria-hidden="true" />
            <span className="truncate">{t(T.utility)}</span>
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <LangSwitch tone="light" />
            <span className="h-4 w-px bg-white/20" aria-hidden="true" />
            <A to="portal" className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1.5 font-medium text-white/85 transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none">
              <LuUserRound className="size-3.5" aria-hidden="true" />
              {t(UI.portal)}
            </A>
          </div>
        </Container>
      </div>
      <header className={cn('sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md transition-[border-color,box-shadow] duration-300', scrolled ? 'border-line shadow-[0_8px_24px_-18px_rgb(10_10_10/0.35)]' : 'border-transparent')}>
        <Container className="flex h-[68px] items-center gap-4 sm:h-[76px] lg:gap-6">
          <a href={href('')} className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:outline-none" aria-label={`${ACADEMY.name} · ${t(UI.home)}`}>
            <SkyArcLogo tone="black" className="h-10 sm:h-12" />
          </a>
          <NavigationMenu.Root className="relative hidden lg:block" aria-label={t(T.mainNav)} delayDuration={80}>
            <NavigationMenu.List className="flex items-center gap-0.5">
              <ProgramsMenu />
              {LINKS.map((l) => (
                <NavigationMenu.Item key={l.to}>
                  <NavigationMenu.Link asChild>
                    <A to={l.to} className={navLink}>
                      {t(l.label)}
                    </A>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
              ))}
            </NavigationMenu.List>
          </NavigationMenu.Root>
          <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
            <a href={ACADEMY.loginUrl} className="hidden min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium text-ink transition hover:bg-warm focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:outline-none lg:inline-flex">
              <LuLogIn className="size-4" aria-hidden="true" />
              {login}
            </a>
            <BookButton className="hidden min-h-11 px-5 text-[14.5px] sm:inline-flex" />
            <BookButton className="min-h-11 px-4 text-[14px] shadow-none sm:hidden" label={t(T.book)} icon={false} />
            <MobileMenu />
          </div>
        </Container>
      </header>
    </>
  )
}
