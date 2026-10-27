import { LuPresentation } from 'react-icons/lu'
import { useOptionalBranch } from '@/branch/BranchProvider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const HINT = 'Made-up students and classes, for showing the app. Switch back to the academy’s data in the account menu.'

/**
 * Marks the demo academy while it's shown (docs/DECISIONS.md §22), so its made-up people are never taken for the
 * academy's own: a row under the sidebar's logo (`row`), a pill in the phone's top bar (`pill`), or a dot on the closed
 * sidebar's icon (`dot`).
 */
export function DemoBadge({ variant = 'pill', className }: { variant?: 'row' | 'pill' | 'dot'; className?: string }) {
  const branch = useOptionalBranch()
  if (!branch?.isDemo) return null
  if (variant === 'dot') return <span className={cn('pointer-events-none size-2 rounded-full bg-amber-500 ring-2 ring-sidebar', className)} aria-label="Demo data" />
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-testid="demo-badge"
          className={cn(
            'flex shrink-0 items-center gap-1.5 bg-amber-100 font-medium text-amber-900 outline-hidden focus-visible:ring-2 focus-visible:ring-ring dark:bg-amber-400/15 dark:text-amber-300',
            variant === 'row' ? 'rounded-md px-2.5 py-1 text-xs' : 'rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
            className,
          )}
        >
          {variant === 'row' ? <LuPresentation className="size-3.5" /> : null}
          {variant === 'row' ? 'Demo data' : 'Demo'}
        </span>
      </TooltipTrigger>
      <TooltipContent side={variant === 'row' ? 'right' : 'bottom'} className="max-w-64">
        {HINT}
      </TooltipContent>
    </Tooltip>
  )
}
