import { useRouteError } from 'react-router'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { isStaleBuildError, reloadForNewBuild, reloadPage } from './staleBuild'

/** Shown when a page fails to load or crashes. After a deploy, the page reloads itself instead. */
export function RouteError() {
  const error = useRouteError()
  if (isStaleBuildError(error) && reloadForNewBuild(error)) return <FullPageSpinner label="Loading the latest version…" />
  const detail = error instanceof Error ? error.message : null
  return (
    <FullPageMessage
      title="Something went wrong"
      description="This page couldn’t open. Reload to try again; if it keeps happening, check your internet connection."
      actions={[
        { label: 'Reload', onClick: () => void reloadPage(error) },
        { label: 'Go home', to: '/app', variant: 'outline' },
      ]}
    >
      {detail ? <p className="mt-4 text-xs break-words text-muted-foreground">{detail}</p> : null}
    </FullPageMessage>
  )
}
