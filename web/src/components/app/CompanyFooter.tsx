import { ACADEMY_NAME } from '@shared/brand'
import { cn } from '@/lib/utils'

const YEAR = new Date().getFullYear()

/** "© 2026 Sky Arc Sports Academy · Privacy · Help" for public pages; both are the website's pages (src/site). */
export function CompanyFooter({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      © {YEAR} {ACADEMY_NAME} ·{' '}
      <a href="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
        Privacy
      </a>{' '}
      ·{' '}
      <a href="/help" className="underline-offset-2 hover:text-foreground hover:underline">
        Help
      </a>
    </p>
  )
}
