import { useMemo, useState } from 'react'
import type { IconType } from 'react-icons'
import { LuChartColumn, LuCpu, LuHistory, LuKeyRound, LuListChecks, LuUserCog } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { type SpendRange, spendRange } from '@shared/ai/usage'
import { type DateKey, addDays, toInstant, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAiConfig, useAiUsage } from './api'
import { ChangesTab } from './ChangesTab'
import { KeysTab } from './KeysTab'
import { ModelsTab } from './ModelsTab'
import { RequestsTab } from './RequestsTab'
import { SpendTab } from './SpendTab'
import { SuperAdminsTab } from './SuperAdminsTab'

/**
 * Settings → AI (docs/DECISIONS.md §26), for super admins only: the models each AI feature uses, the providers' keys,
 * the spend and every request, the change history, and who the super admins are.
 *
 * The one exception to CLAUDE.md's "AI naming" rule: everywhere the academy's people look, the app says only "AI" and
 * never names a model or a provider. This page names them, because it's where super admins choose them; nobody else
 * can open it (the route checks, and firestore.rules lets only super admins read what it shows).
 */

type Tab = 'models' | 'keys' | 'spend' | 'requests' | 'changes' | 'admins'

const TABS: { key: Tab; label: string; icon: IconType }[] = [
  { key: 'models', label: 'Models', icon: LuCpu },
  { key: 'keys', label: 'Keys', icon: LuKeyRound },
  { key: 'spend', label: 'Spend', icon: LuChartColumn },
  { key: 'requests', label: 'Requests', icon: LuListChecks },
  { key: 'changes', label: 'Changes', icon: LuHistory },
  { key: 'admins', label: 'Super admins', icon: LuUserCog },
]

export interface RangeState {
  range: SpendRange
  from: DateKey
  to: DateKey
}

export function AiSettings() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const { timezone } = useBranch()
  const active: Tab = TABS.some((t) => t.key === tab) ? (tab as Tab) : 'models'
  const { config, loading } = useAiConfig()

  // Spend and Requests share their dates.
  const today = todayKey(timezone)
  const [range, setRange] = useState<RangeState>(() => ({ range: 'this_month', ...spendRange('this_month', today) }))
  const fromMs = useMemo(() => toInstant(range.from, 0, timezone).getTime(), [range.from, timezone])
  const toMs = useMemo(() => toInstant(addDays(range.to, 1), 0, timezone).getTime(), [range.to, timezone])
  const usage = useAiUsage(fromMs, toMs)

  return (
    <div data-testid="ai-settings">
      <div className="mb-4 min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">AI</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The models the app’s AI features use, the providers’ keys, and what it all costs. Only super admins see this page; everyone else just sees “AI”.
        </p>
      </div>
      <Tabs value={active} onValueChange={(v) => navigate(`/admin/settings/ai/${v}`, { replace: true })}>
        {/* Phones: the tabs share the width on two rows, rather than run off the screen. */}
        <TabsList className="grid w-full grid-cols-3 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="h-8 min-w-0 px-2 sm:flex-none sm:px-3" data-testid={`ai-tab-${t.key}`}>
              <t.icon className="hidden sm:block" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {loading ? (
          <Skeleton className="mt-4 h-72 max-w-4xl rounded-xl" />
        ) : (
          <>
            <TabsContent value="models" className="mt-4">
              <ModelsTab config={config} />
            </TabsContent>
            <TabsContent value="keys" className="mt-4">
              <KeysTab config={config} />
            </TabsContent>
            <TabsContent value="spend" className="mt-4">
              <SpendTab config={config} range={range} onRange={setRange} rows={usage.data} loading={usage.loading} />
            </TabsContent>
            <TabsContent value="requests" className="mt-4">
              <RequestsTab range={range} onRange={setRange} rows={usage.data} loading={usage.loading} />
            </TabsContent>
            <TabsContent value="changes" className="mt-4">
              <ChangesTab />
            </TabsContent>
            <TabsContent value="admins" className="mt-4">
              <SuperAdminsTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
