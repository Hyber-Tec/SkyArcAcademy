import { CompanyFooter } from '@/components/app/CompanyFooter'
import { LangSwitch } from '@/components/app/LangSwitch'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { cn } from '@/lib/utils'

/** The contract's public pages (signing at /sign/{token}, asking at /contract): the page, its language switch, and a card under the logo. */
export function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-svh bg-muted/40 px-4 py-8 sm:py-12">
      <div className={cn('mx-auto w-full space-y-5', wide ? 'max-w-3xl' : 'max-w-md')}>{children}</div>
      <div className="mt-8 flex justify-center">
        <LangSwitch />
      </div>
      <CompanyFooter className="mt-3 text-center" />
    </div>
  )
}

/** The logo, centered over a card's content (CLAUDE.md, "Brand and logos"). */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 shadow-sm sm:p-8', className)}>
      <div className="mb-6 flex justify-center">
        <SkyArcLogo className="h-16" />
      </div>
      {children}
    </div>
  )
}
