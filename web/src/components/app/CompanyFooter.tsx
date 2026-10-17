import { Link } from 'react-router'
import { ACADEMY_NAME } from '@shared/brand'
import { cn } from '@/lib/utils'

const YEAR = new Date().getFullYear()

/** "© 2026 Sky Arc Sports Academy · Privacy · Help" for public pages, as on the homepage. */
export function CompanyFooter({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      © {YEAR} {ACADEMY_NAME} ·{' '}
      <Link to="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
        Privacy
      </Link>{' '}
      ·{' '}
      <Link to="/help" className="underline-offset-2 hover:text-foreground hover:underline">
        Help
      </Link>
    </p>
  )
}
