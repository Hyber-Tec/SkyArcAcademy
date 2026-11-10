import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { AuthProvider } from '@/auth/AuthProvider'
import { ThemeProvider } from '@/components/app/theme'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { router } from './app/router'
import { reloadForNewBuild, reloadPage, watchForNewBuild } from './app/staleBuild'
import './index.css'

// A tab opened before a deploy asks for files that no longer exist: reload once to pick up the new build. A page that
// fails while opening is left to the route's error page, which reloads at the address being opened.
window.addEventListener('vite:preloadError', (event) => {
  if (router.state.navigation.state === 'idle') reloadForNewBuild((event as Event & { payload?: unknown }).payload)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          <RouterProvider router={router} />
          <Toaster richColors position="top-center" />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)

// Installable app ("Sky Arc"). Not in dev or against the emulators.
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.VITE_USE_EMULATORS !== '1') {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}

// A tab left open across a deploy is offered the new version (a fresh load always gets it: public/sw.js).
if (import.meta.env.PROD) {
  watchForNewBuild(() =>
    toast('A new version of the app is ready', {
      id: 'new-build',
      description: 'Reload to get the latest changes.',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => void reloadPage() },
    }),
  )
}
