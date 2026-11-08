import { createRoot } from 'react-dom/client'
import { phoneKind, storeFor } from '@shared/appStores'
import './styles.css'
import { SiteDataProvider } from './data'
import { MotionRoot } from './kit/motion'
import { SiteProvider } from './kit/site'
import { App } from './App'

// The app sign's QR code (`/get-app?go`): a phone goes straight to its own store; a computer, or a store that won't open,
// stays on the page with both.
if (/^\/(ko\/)?get-app\/?$/.test(location.pathname) && new URLSearchParams(location.search).has('go')) {
  const store = storeFor(phoneKind(navigator.userAgent, navigator.maxTouchPoints))
  if (store) location.replace(store)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <MotionRoot>
    <SiteProvider>
      <SiteDataProvider>
        <App />
      </SiteDataProvider>
    </SiteProvider>
  </MotionRoot>,
)
