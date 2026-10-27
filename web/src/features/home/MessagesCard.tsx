import { LuChevronRight, LuInbox, LuMessageCircle, LuUserPlus } from 'react-icons/lu'
import { Link } from 'react-router'
import type { WithId } from '@shared/types'
import type { WebsiteMessage } from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { aboutLine, kindLabel, when } from '@/features/website/messageText'
import { cn } from '@/lib/utils'

const PAGE = '/admin/settings/website/messages'
/** How many new messages the card lists before "All messages". */
const SHOWN = 4

/**
 * Home's Messages: trial requests and questions sent from the website and not yet marked done, newest first (the count
 * is in the sidebar's Home badge too). Each opens in Settings → Website → Messages, where the office replies.
 */
export function MessagesCard({ messages, loading }: { messages: WithId<WebsiteMessage>[]; loading: boolean }) {
  const { timezone } = useBranch()
  const fresh = messages.filter((m) => m.status !== 'done')
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="home-messages">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Messages</h2>
        {fresh.length ? (
          <span className="rounded-full bg-red-500 px-2 text-xs leading-5 font-semibold text-white tabular-nums" aria-label={`${fresh.length} new`}>
            {fresh.length > 99 ? '99+' : fresh.length}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground">Checking…</div>
      ) : fresh.length ? (
        <ul className="divide-y border-t">
          {fresh.slice(0, SHOWN).map((m) => {
            const trial = m.kind === 'trial'
            const Icon = trial ? LuUserPlus : LuMessageCircle
            return (
              <li key={m.id}>
                <Link to={`${PAGE}?m=${m.id}`} className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/50" data-testid="home-message">
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                      trial ? 'bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400' : 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">{m.name || 'No name given'}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {kindLabel(m)}
                      {aboutLine(m) ? ` · ${aboutLine(m)}` : ''}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground/80">{when(m.createdAt, timezone)}</span>
                  </span>
                  <LuChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-3 border-t px-4 py-4 text-sm text-muted-foreground">
          <LuInbox className="size-5" />
          Nothing new from the website.
        </div>
      )}
      <Link to={PAGE} className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground">
        {fresh.length > SHOWN ? `All messages (${fresh.length - SHOWN} more new)` : 'All messages'} <LuChevronRight className="size-3.5" />
      </Link>
    </section>
  )
}
