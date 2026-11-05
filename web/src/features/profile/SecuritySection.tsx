import { useState } from 'react'
import { LuLogOut } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { PasswordDialog, SignInMethodsList } from '@/components/app/SignInSecurity'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/lang'
import { SectionTitle } from './ProfileLayout'

/** Profile → Sign-in & security: how the account signs in, its password, and signing out. */
export function SecuritySection() {
  const { branch } = useBranch()
  const { email, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState(false)
  const t = useT()
  return (
    <div>
      <SectionTitle
        title={t('Sign-in & security', '로그인 및 보안')}
        description={t(`Your access to ${branch.name} follows your email, ${email ?? ''}, whichever way you sign in.`, `어떤 방법으로 로그인하든 같은 이메일(${email ?? ''})로 ${branch.name}에 연결돼요.`)}
      />
      <section className="rounded-xl border bg-card p-5" aria-labelledby="methods-title">
        <h3 id="methods-title" className="text-sm font-semibold">
          {t('Ways to sign in', '로그인 방법')}
        </h3>
        <p className="mt-0.5 mb-4 text-sm text-muted-foreground">{t('Use the same ones on the website and in the phone app.', '웹사이트와 앱에서 같은 방법으로 로그인할 수 있어요.')}</p>
        <SignInMethodsList onPassword={() => setPassword(true)} />
      </section>
      <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5" aria-labelledby="signout-title">
        <div>
          <h3 id="signout-title" className="text-sm font-semibold">
            {t('Sign out', '로그아웃')}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('On a shared computer, sign out when you’re done.', '함께 쓰는 컴퓨터라면 다 쓴 뒤 로그아웃해 주세요.')}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <LuLogOut /> {t('Sign out', '로그아웃')}
        </Button>
      </section>
      <PasswordDialog open={password} onOpenChange={setPassword} />
    </div>
  )
}
