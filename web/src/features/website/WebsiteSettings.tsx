import type { IconType } from 'react-icons'
import { LuExternalLink, LuImages, LuInbox, LuPanelsTopLeft, LuQuote, LuUsers } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWebsiteContent, useWebsiteMessages, useWebsitePhotos } from './api'
import { CoachesTab } from './CoachesTab'
import { MessagesTab } from './MessagesTab'
import { PagesTab } from './PagesTab'
import { PhotosTab } from './PhotosTab'
import { TestimonialsTab } from './TestimonialsTab'

type Tab = 'messages' | 'photos' | 'pages' | 'coaches' | 'testimonials'

const TABS: { key: Tab; label: string; icon: IconType }[] = [
  { key: 'messages', label: 'Messages', icon: LuInbox },
  { key: 'photos', label: 'Photos', icon: LuImages },
  { key: 'pages', label: 'Pages', icon: LuPanelsTopLeft },
  { key: 'coaches', label: 'Coaches', icon: LuUsers },
  { key: 'testimonials', label: 'Testimonials', icon: LuQuote },
]

/**
 * Settings → Website (docs/DECISIONS.md §18; under Settings since 2026-10-27): the academy's public website, filled from
 * here. Messages sent from it (trial requests and questions, also on Home), its photo library, what its pages show, the
 * coach cards and the families' quotes. The address keeps the tab (`/admin/settings/website/photos`), so links and the
 * notifications open the right one.
 */
export function WebsiteSettings() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const active: Tab = TABS.some((t) => t.key === tab) ? (tab as Tab) : 'messages'
  // Loaded once for every tab, so moving between them never flashes empty.
  const messages = useWebsiteMessages()
  const photos = useWebsitePhotos()
  const { content, loading: contentLoading } = useWebsiteContent()
  const newCount = messages.data.filter((m) => m.status !== 'done').length

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Website</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">What the academy’s public website shows, and the messages people send from it.</p>
        </div>
        <Button variant="outline" asChild>
          <a href="/" target="_blank" rel="noreferrer">
            <LuExternalLink /> View website
          </a>
        </Button>
      </div>
      <Tabs value={active} onValueChange={(v) => navigate(`/admin/settings/website/${v}`, { replace: true })}>
        {/* Phones: the tabs share the width on two rows, rather than run off the screen. */}
        <TabsList className="grid w-full grid-cols-3 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="h-8 min-w-0 px-2 sm:flex-none sm:px-3">
              <t.icon className="hidden sm:block" />
              {t.label}
              {t.key === 'messages' && newCount ? (
                <Badge className="h-5 min-w-5 rounded-full bg-brand-solid px-1.5 text-white tabular-nums" aria-label={`${newCount} new`}>
                  {newCount > 99 ? '99+' : newCount}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="messages" className="mt-4">
          <MessagesTab messages={messages.data} loading={messages.loading} />
        </TabsContent>
        <TabsContent value="photos" className="mt-4">
          <PhotosTab photos={photos.data} content={content} loading={photos.loading} />
        </TabsContent>
        <TabsContent value="pages" className="mt-4">
          {contentLoading ? <Loading /> : <PagesTab photos={photos.data} content={content} />}
        </TabsContent>
        <TabsContent value="coaches" className="mt-4">
          {contentLoading ? <Loading /> : <CoachesTab photos={photos.data} content={content} />}
        </TabsContent>
        <TabsContent value="testimonials" className="mt-4">
          {contentLoading ? <Loading /> : <TestimonialsTab content={content} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Loading() {
  return <Skeleton className="h-72 max-w-4xl rounded-xl" />
}
