import { type RouteObject, createBrowserRouter } from 'react-router'
import { FullPageMessage } from '@/components/app/FullPage'
import { AuthAction } from '@/pages/public/AuthAction'
import { ForgotPassword } from '@/pages/public/ForgotPassword'
import { Login } from '@/pages/public/Login'
import { SignUp } from '@/pages/public/SignUp'
import { VerifyEmail } from '@/pages/public/VerifyEmail'
import { RootRoute } from '@/pages/public/RootRoute'
import { academyRoute, page } from './academyRoutes'

const routes: RouteObject[] = [
  { path: '/', element: <RootRoute /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <SignUp /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  { path: '/auth/action', element: <AuthAction /> },
  // Asking the academy for access (coaches, parents), once signed in.
  { path: '/join', lazy: page(() => import('@/features/signup/BranchSignupPage'), 'BranchSignupPage') },
  academyRoute,
  {
    path: '*',
    element: <FullPageMessage title="Page not found" actions={[{ label: 'Go home', to: '/' }]} />,
  },
]

export const router = createBrowserRouter(routes)
