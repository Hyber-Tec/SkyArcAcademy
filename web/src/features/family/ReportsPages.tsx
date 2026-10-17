import { useState } from 'react'
import { LuChartLine, LuChevronRight } from 'react-icons/lu'
import { Link } from 'react-router'
import { formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendChip } from '@/features/reports/ReportParts'
import { useFamilyReports } from '@/features/reports/data'
import { type Report, one, toDate } from '@/features/reports/model'
import { ContactCard } from './FamilyWidgets'
import { useLinkedStudentIds, useStudentsById } from './data'

function ReportCard({ r, showName }: { r: Report; showName: boolean }) {
  const { timezone } = useBranch()
  const shared = toDate(r.sharedAt)
  return (
    <Link to={`/report/${r.id}`} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" data-testid="family-report">
      <Card className="flex-row items-center gap-4 p-5 transition hover:shadow-md">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#c80000]/10 text-[#c80000]">
          <LuChartLine className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{r.customName || `${r.period.label} progress report`}</span>
            {!r.firstViewedAt ? <Badge>New</Badge> : null}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {[showName ? r.student.firstName || r.studentName : '', `${r.evaluationCount} scored ${r.evaluationCount === 1 ? 'evaluation' : 'evaluations'}`, r.facts?.average != null ? `average ${one(r.facts.average)} per 10 shots` : '']
              .filter(Boolean)
              .join(' · ')}
          </div>
          {shared ? <div className="mt-0.5 text-xs text-muted-foreground">Shared {formatInstant(shared, timezone, { month: 'long', day: 'numeric', year: 'numeric' })}</div> : null}
        </div>
        {r.options?.showStatus !== false && r.facts?.trend?.level ? (
          <span className="hidden sm:inline-flex">
            <TrendChip level={r.facts.trend.level} audience="family" size="sm" />
          </span>
        ) : null}
        <LuChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  )
}

function ReportsList({ ids, who }: { ids: string[]; who: 'parent' | 'student' }) {
  const { branch } = useBranch()
  const { map: students } = useStudentsById(ids)
  const [child, setChild] = useState('all')
  const { data, loading } = useFamilyReports(ids)
  const shown = data.filter((r) => child === 'all' || r.studentId === child)
  const name = (id: string) => students.get(id)?.firstName || students.get(id)?.name || 'Student'
  // Children A to Z, whatever order they were linked in.
  const kids = [...ids].sort((a, b) => name(a).localeCompare(name(b)))

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Progress reports"
        description={who === 'parent' ? `How ${ids.length > 1 ? 'your children are' : `${name(ids[0])} is`} doing, from ${branch.name}.` : `How you’re doing, from ${branch.name}.`}
        className="mb-2"
      />
      {ids.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {['all', ...kids].map((id) => (
            <Button key={id} variant={child === id ? 'default' : 'outline'} size="sm" className="rounded-full" aria-pressed={child === id} onClick={() => setChild(id)}>
              {id === 'all' ? 'Everyone' : name(id)}
            </Button>
          ))}
        </div>
      ) : null}
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : shown.length ? (
        <div className="space-y-3">
          {shown.map((r) => (
            <ReportCard key={r.id} r={r} showName={ids.length > 1 && child === 'all'} />
          ))}
        </div>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuChartLine />
            </EmptyMedia>
            <EmptyTitle>No reports yet</EmptyTitle>
            <EmptyDescription>{branch.name} shares a progress report here when it’s ready.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <ContactCard />
    </div>
  )
}

function NotLinked({ who }: { who: 'parent' | 'student' }) {
  const { branch } = useBranch()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{who === 'parent' ? 'No students linked yet' : 'Your account isn’t linked yet'}</EmptyTitle>
          <EmptyDescription>{who === 'parent' ? `Ask ${branch.name} to link your child to your account.` : `Ask ${branch.name} to link your account to your student record.`}</EmptyDescription>
        </EmptyHeader>
      </Empty>
      <ContactCard title="Contact" />
    </div>
  )
}

/** Parent → Reports: each linked child's shared progress reports. */
export function ParentReportsPage() {
  const ids = useLinkedStudentIds('parent')
  if (!ids.length) return <NotLinked who="parent" />
  return <ReportsList ids={ids} who="parent" />
}

/** Student → Reports: their own shared progress reports. */
export function StudentReportsPage() {
  const ids = useLinkedStudentIds('student')
  if (!ids.length) return <NotLinked who="student" />
  return <ReportsList ids={ids} who="student" />
}
