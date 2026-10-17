import { type RouteObject, createBrowserRouter } from 'react-router'
import { FullPageMessage } from '@/components/app/FullPage'
import { AuthAction } from '@/pages/public/AuthAction'
import { ForgotPassword } from '@/pages/public/ForgotPassword'
import { Login } from '@/pages/public/Login'
import { PrivacyPage } from '@/pages/public/PrivacyPage'
import { SignUp } from '@/pages/public/SignUp'
import { TrialPage } from '@/pages/public/TrialPage'
import { VerifyEmail } from '@/pages/public/VerifyEmail'
import { RootRoute } from '@/pages/public/RootRoute'
import { academyRoute, page } from './academyRoutes'
import { RouteError } from './RouteError'

const routes: RouteObject[] = [
  { path: '/', element: <RootRoute /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <SignUp /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  { path: '/auth/action', element: <AuthAction /> },
  // The homepage's "Book a trial" (the booking itself comes later).
  { path: '/trial', element: <TrialPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  // Help for anyone (the stores' Support URL; the phone app links it).
  { path: '/help', lazy: page(() => import('@/pages/public/HelpPage'), 'HelpPage') },
  // Asking the academy for access (coaches, parents), once signed in.
  { path: '/join', lazy: page(() => import('@/features/signup/BranchSignupPage'), 'BranchSignupPage') },
  academyRoute,
  {
    path: '*',
    element: <FullPageMessage title="Page not found" actions={[{ label: 'Go home', to: '/' }]} />,
  },
]

// Every page's errors land on one friendly page (or a reload, after a deploy).
export const router = createBrowserRouter([{ errorElement: <RouteError />, children: routes }])
