import { Fragment } from 'react'
import { LuBadgeDollarSign } from 'react-icons/lu'
import { Link } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import type { PayGap } from './payGaps'

const AMBER = 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
const LINK = 'font-medium underline underline-offset-2'

/** Where a person's rate is set: their page in Employees → Directory, at its pay card. */
const payCard = (g: PayGap) => `/admin/employees/directory/${g.staff.id}#pay`

/**
 * Says who has no hourly rate yet (their worked time is priced at $0), with a link to each person's page, where the rate
 * is set (`link`: false on a page that sets rates itself).
 */
export function PayGapNotice({ gaps, link = true, className }: { gaps: PayGap[]; link?: boolean; className?: string }) {
  if (!gaps.length) return null
  const one = gaps.length === 1
  return (
    <Alert className={cn(AMBER, className)} data-testid="pay-gap-notice">
      <LuBadgeDollarSign />
      <AlertTitle>{one ? `${gaps[0].staff.name} has no hourly rate yet` : `${gaps.length} employees have no hourly rate yet`}</AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        <p>
          {one ? (
            <>
              Their worked time is paid $0 until it’s set.
              {link ? (
                <>
                  {' '}
                  <Link to={payCard(gaps[0])} className={LINK}>
                    Set their rate
                  </Link>
                </>
              ) : null}
            </>
          ) : (
            <>
              Their worked time is paid $0 until it’s set:{' '}
              {gaps.map((g, i) => (
                <Fragment key={g.staff.id}>
                  {i ? ', ' : ''}
                  {link ? (
                    <Link to={payCard(g)} className={LINK}>
                      {g.staff.name}
                    </Link>
                  ) : (
                    g.staff.name
                  )}
                </Fragment>
              ))}
              .
            </>
          )}
        </p>
      </AlertDescription>
    </Alert>
  )
}

/** The same notice for one employee's own page or payroll report. */
export function RateMissingNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Alert className={cn(AMBER, className)} data-testid="rate-missing">
      <LuBadgeDollarSign />
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        <p>{children}</p>
      </AlertDescription>
    </Alert>
  )
}
