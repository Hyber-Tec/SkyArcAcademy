import { ACADEMY_NAME } from '@shared/brand'
import { useLang } from '@/lib/lang'
import { cn } from '@/lib/utils'

const YEAR = new Date().getFullYear()

/** "© 2026 Sky Arc Sports Academy · Privacy · Help" for public pages; both are the website's pages (src/site), in Korean at /ko/…. */
export function CompanyFooter({ className }: { className?: string }) {
  const ko = useLang() === 'ko'
  return (
    <p className={cn('text-xs text-muted-foreground', className)}>
      © {YEAR} {ACADEMY_NAME} ·{' '}
      <a href={ko ? '/ko/privacy' : '/privacy'} className="underline-offset-2 hover:text-foreground hover:underline">
        {ko ? '개인정보 처리방침' : 'Privacy'}
      </a>{' '}
      ·{' '}
      <a href={ko ? '/ko/help' : '/help'} className="underline-offset-2 hover:text-foreground hover:underline">
        {ko ? '도움말' : 'Help'}
      </a>
    </p>
  )
}
