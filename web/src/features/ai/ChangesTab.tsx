import { useState } from 'react'
import { LuArrowRight } from 'react-icons/lu'
import type { AiChangeAction } from '@shared/ai/types'
import { formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAiChanges } from './api'

const KIND: Record<AiChangeAction, string> = {
  'key.set': 'Key',
  'key.remove': 'Key',
  settings: 'Settings',
  'superAdmin.add': 'Super admin',
  'superAdmin.remove': 'Super admin',
}

const PAGE = 50

/** AI → Changes: every change to the keys, the settings and the super admins, newest first. Keys show only their last 4. */
export function ChangesTab() {
  const { timezone } = useBranch()
  const [count, setCount] = useState(PAGE)
  const { data, loading, error } = useAiChanges(count)

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Changes</CardTitle>
        <CardDescription>Every change to the keys, the models, the limits, the prices and the super admins: who made it and when. Entries can’t be edited or deleted.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {error ? <p className="px-6 pb-4 text-sm text-destructive">{error.message}</p> : null}
        {loading && !data.length ? (
          <div className="space-y-2 px-6 pb-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data.length ? (
          <ul className="divide-y border-t" data-testid="ai-changes">
            {data.map((c) => {
              const at = (c.at as { toMillis?: () => number } | null)?.toMillis?.()
              return (
                <li key={c.id} className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:gap-4">
                  <div className="w-44 shrink-0 text-xs text-muted-foreground tabular-nums">{at ? formatInstant(at, timezone) : 'Saving…'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{c.summary}</div>
                    {c.from || c.to ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={c.from ? 'line-through decoration-muted-foreground/50' : ''}>{c.from ?? '—'}</span>
                        <LuArrowRight className="size-3" aria-hidden />
                        <span className="text-foreground">{c.to ?? '—'}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-start gap-2 text-xs sm:w-60 sm:justify-end">
                    <span className="truncate text-muted-foreground" title={c.by?.email}>
                      {c.by?.name || c.by?.email}
                    </span>
                    <Badge variant="outline">{KIND[c.action] ?? c.action}</Badge>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="border-t px-6 py-10 text-center text-sm text-muted-foreground">No changes yet.</p>
        )}
        {data.length >= count ? (
          <div className="flex justify-center border-t p-4">
            <Button variant="outline" onClick={() => setCount((n) => n + PAGE)}>
              Load more
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
