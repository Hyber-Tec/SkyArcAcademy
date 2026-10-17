import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { Button } from '@/components/ui/button'

/** A public page to read (the privacy policy, help): the full logo, a title, then sections; Home and Log in at the end. */
export function PublicDoc({ title, subtitle, notice, children }: { title: string; subtitle?: ReactNode; notice?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/40 px-4 py-10">
      <article className="mx-auto w-full max-w-3xl space-y-8 rounded-2xl border bg-card px-5 py-8 text-[15px] leading-7 shadow-sm sm:px-10 sm:py-10">
        <header className="space-y-4">
          <Link to="/" aria-label="Home">
            <SkyArcLogo className="h-12" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {notice}
        </header>
        {children}
        <footer className="flex flex-wrap gap-2 border-t pt-6">
          <Button variant="outline" asChild>
            <Link to="/">Home</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/login">Log in</Link>
          </Button>
        </footer>
      </article>
      <CompanyFooter className="mt-6 text-center" />
    </div>
  )
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export function DocList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

/** The academy's ways to reach it as a list, or its website when the profile has none yet. */
export function AcademyContact({ ways }: { ways: ReactNode[] }) {
  return ways.length ? (
    <DocList items={ways} />
  ) : (
    <p>
      Through the academy’s website,{' '}
      <a href="https://skyarcacademy.com" className="underline underline-offset-2">
        skyarcacademy.com
      </a>
      .
    </p>
  )
}
