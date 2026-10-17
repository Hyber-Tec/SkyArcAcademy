import { LuChartLine, LuChevronRight } from 'react-icons/lu'
import { Link, useSearchParams } from 'react-router'
import { formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { plural } from '@/features/home/parts'
import { useFamilyReports } from '@/features/reports/data'
import { type Report, one, toDate } from '@/features/reports/model'
import { type Family, useFamily, useIsNewReport } from './data'
import { ContactCard, FamilyTrend, KidFilter, KidMark, NotLinked } from './FamilyWidgets'

/**
 * Parent and Student → Reports: the progress reports the academy has shared, newest first, "New" until opened; each
 * opens the report itself (`/report/{id}`). Parents with more than one child pick whose (`?child=`).
 */
export function FamilyReportsPage() {
  const { branch } = useBranch()
  const family = useFamily()
  const [params, setParams] = useSearchParams()
  const childParam = params.get('child') ?? 'all'
  const kid = family.kids.some((k) => k.id === childParam) ? childParam : 'all'
  const { data, loading } = useFamilyReports(family.ids)
  const isNew = useIsNewReport()
  const shown = data.filter((r) => kid === 'all' || r.studentId === kid)
  const showKid = family.kids.length > 1 && kid === 'all'

  if (family.notLinked) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader title="Reports" />
        <NotLinked family={family} />
      </div>
    )
  }

  const description =
    family.who === 'student'
      ? `How you’re doing, from ${branch.name}.`
      : kid === 'all' && family.kids.length > 1
        ? `How your children are doing, from ${branch.name}.`
        : `How ${family.firstName(kid === 'all' ? family.ids[0] : kid)} is doing, from ${branch.name}.`

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Reports" description={family.loading ? '\u00a0' : description} className="mb-4" />
      <div className="mb-4">
        <KidFilter family={family} value={kid} onChange={(id) => setParams(id === 'all' ? {} : { child: id }, { replace: true })} />
      </div>
      {loading || family.loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : shown.length ? (
        <ul className="space-y-3" data-testid="family-reports">
          {shown.map((r) => (
            <li key={r.id}>
              <ReportItem r={r} family={family} showKid={showKid} isNew={isNew(r)} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="border bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuChartLine />
            </EmptyMedia>
            <EmptyTitle>No reports yet</EmptyTitle>
            <EmptyDescription>{branch.name} shares a progress report here when one is ready.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <div className="mt-6">
        <ContactCard />
      </div>
    </div>
  )
}

function ReportItem({ r, family, showKid, isNew }: { r: Report; family: Family; showKid: boolean; isNew: boolean }) {
  const { timezone } = useBranch()
  const shared = toDate(r.sharedAt)
  const trend = r.options?.showStatus !== false ? (r.facts?.trend?.level ?? null) : null
  return (
    <Link
      to={`/report/${r.id}`}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
      data-testid="family-report"
    >
      <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-text sm:flex">
        <LuChartLine className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showKid ? (
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <KidMark name={family.firstName(r.studentId)} tint={family.tint(r.studentId)} className="size-5 text-[10px]" />
              {family.firstName(r.studentId)}
              <span className="text-muted-foreground/60">·</span>
            </span>
          ) : null}
          <span className="font-semibold">{r.customName || 'Progress report'}</span>
          {isNew ? <Badge className="bg-brand-solid text-white">New</Badge> : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{r.period.label}</p>
        {trend ? (
          <span className="mt-2 inline-flex sm:hidden">
            <FamilyTrend level={trend} />
          </span>
        ) : null}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {r.facts?.average != null ? (
            <span>
              <span className="text-sm font-semibold text-foreground tabular-nums">{one(r.facts.average)}</span> average per 10 shots
            </span>
          ) : null}
          <span>{plural(r.evaluationCount, 'scored evaluation')}</span>
          {shared ? <span>Shared {formatInstant(shared, timezone, { month: 'short', day: 'numeric', year: 'numeric' })}</span> : null}
        </p>
      </div>
      {trend ? (
        <span className="hidden shrink-0 sm:inline-flex">
          <FamilyTrend level={trend} />
        </span>
      ) : null}
      <LuChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}
