import { type ComponentType, Suspense, createElement, lazy, useEffect, useState } from 'react'
import { useIntro } from '@/site/kit/Intro'
import { useSite } from '@/site/kit/site'
import { BookingProvider } from './booking-context'
import { AcademyIntro } from './components/AcademyIntro'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { IntroReady } from './intro-context'
import { Home } from './pages/Home'

/**
 * A page that loads on its own, so the homepage doesn't wait for the others. Once the homepage is showing, the others
 * load quietly in the background (`preload`), so moving to one never waits either.
 */
function lazyPage<M, P extends object>(load: () => Promise<M>, pick: (m: M) => ComponentType<P>) {
  let mod: M | null = null
  const preload = () => load().then((m) => (mod = m))
  const Lazy = lazy(() => preload().then((m) => ({ default: pick(m) })))
  const Page = (props: P) => (mod ? createElement(pick(mod), props) : createElement(Lazy as unknown as ComponentType<P>, props))
  return Object.assign(Page, { preload })
}

const Programs = lazyPage(() => import('./pages/Programs'), (m) => m.Programs)
const About = lazyPage(() => import('./pages/About'), (m) => m.About)
const Gallery = lazyPage(() => import('./pages/Gallery'), (m) => m.Gallery)
const News = lazyPage(() => import('./pages/News'), (m) => m.News)
const NewsPostPage = lazyPage(() => import('./pages/News'), (m) => m.NewsPostPage)
const Trial = lazyPage(() => import('./pages/Trial'), (m) => m.Trial)
const Contact = lazyPage(() => import('./pages/Contact'), (m) => m.Contact)
const Portal = lazyPage(() => import('./pages/Portal'), (m) => m.Portal)
const Privacy = lazyPage(() => import('./pages/Legal'), (m) => m.Privacy)
const Help = lazyPage(() => import('./pages/Legal'), (m) => m.Help)
const NotFound = lazyPage(() => import('./pages/NotFound'), (m) => m.NotFound)
const LATER = [Programs, About, Gallery, News, NewsPostPage, Trial, Contact, Portal, Privacy, Help, NotFound]

/**
 * The academy's website (the owner's pick of the design options, "Academy": trust-first and parent-friendly). Every
 * "Book a trial" opens the trial drawer in place.
 */
function Page() {
  const { segments } = useSite()
  const [first, second] = segments
  if (!first) return <Home />
  if (first === 'programs' && !second) return <Programs />
  if (first === 'about' && !second) return <About />
  if (first === 'gallery' && !second) return <Gallery />
  if (first === 'news' && !second) return <News />
  if (first === 'news' && second && segments.length === 2) return <NewsPostPage slug={second} />
  if (first === 'trial' && !second) return <Trial />
  if (first === 'contact' && !second) return <Contact />
  if (first === 'portal' && !second) return <Portal />
  if (first === 'privacy' && !second) return <Privacy />
  if (first === 'help' && !second) return <Help />
  return <NotFound />
}

export function App() {
  const intro = useIntro('skyarc-intro')
  const { path, lang } = useSite()
  const [ready, setReady] = useState(!intro.show)
  // The other pages, once this one has settled.
  useEffect(() => {
    const later = () => LATER.forEach((p) => void p.preload().catch(() => undefined))
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(later, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(later, 2500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!intro.show) {
      const timer = setTimeout(() => setReady(true), 60)
      return () => clearTimeout(timer)
    }
    setReady(false)
  }, [intro.show])

  return (
    <IntroReady.Provider value={ready}>
      <BookingProvider>
        <AcademyIntro show={intro.show} onDone={intro.done} />
        <Header />
        <main id="main" tabIndex={-1} className="outline-none" key={`${path}-${lang}`}>
          <Suspense fallback={<div className="min-h-[80vh]" />}>
            <Page />
          </Suspense>
        </main>
        <Footer />
      </BookingProvider>
    </IntroReady.Provider>
  )
}
