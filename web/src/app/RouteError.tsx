import { useRouteError } from 'react-router'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { useT } from '@/lib/lang'
import { isStaleBuildError, reloadForNewBuild, reloadPage } from './staleBuild'

/** Shown when a page fails to load or crashes. After a deploy, the page reloads itself instead. */
export function RouteError() {
  const error = useRouteError()
  const t = useT()
  if (isStaleBuildError(error) && reloadForNewBuild(error)) return <FullPageSpinner label={t('Loading the latest version…', '최신 버전을 불러오는 중…')} />
  const detail = error instanceof Error ? error.message : null
  return (
    <FullPageMessage
      title={t('Something went wrong', '문제가 생겼어요')}
      description={t(
        'This page couldn’t open. Reload to try again; if it keeps happening, check your internet connection.',
        '페이지를 열지 못했어요. 새로고침해서 다시 시도해 주세요. 계속 안 되면 인터넷 연결을 확인해 주세요.',
      )}
      actions={[
        { label: t('Reload', '새로고침'), onClick: () => void reloadPage(error) },
        { label: t('Go home', '홈으로'), to: '/app', variant: 'outline' },
      ]}
    >
      {detail ? <p className="mt-4 text-xs break-words text-muted-foreground">{detail}</p> : null}
    </FullPageMessage>
  )
}
