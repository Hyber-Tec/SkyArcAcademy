import { createRoot } from 'react-dom/client'
import './styles.css'
import { SiteDataProvider } from './data'
import { MotionRoot } from './kit/motion'
import { SiteProvider } from './kit/site'
import { App } from './App'

createRoot(document.getElementById('root') as HTMLElement).render(
  <MotionRoot>
    <SiteProvider>
      <SiteDataProvider>
        <App />
      </SiteDataProvider>
    </SiteProvider>
  </MotionRoot>,
)
