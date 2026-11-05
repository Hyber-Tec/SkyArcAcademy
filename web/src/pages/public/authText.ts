import { type AuthAction, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type SignInMethods, authErrorMessage, passwordProblem, signInWays } from '@shared/auth'
import type { Lang } from '@shared/i18n'

/**
 * Signing in, in the page's language (docs/DECISIONS.md §36): the English exactly as shared/src/auth.ts words it, the
 * Korean matched to each of its lines (a line it doesn't know stays English).
 */

const PASSWORD_KO: Record<string, string> = {
  [`Use at least ${PASSWORD_MIN_LENGTH} characters.`]: `${PASSWORD_MIN_LENGTH}자 이상 입력해 주세요.`,
  [`Use at most ${PASSWORD_MAX_LENGTH} characters.`]: `${PASSWORD_MAX_LENGTH}자 이하로 입력해 주세요.`,
  'Remove the spaces at the start or end.': '앞뒤 공백을 지워 주세요.',
  'Use more than one repeated character.': '한 글자만 반복한 비밀번호는 쓸 수 없어요.',
  'Don’t use your email name as the password.': '이메일 아이디는 비밀번호로 쓸 수 없어요.',
  'Don’t use your email as the password.': '이메일 주소는 비밀번호로 쓸 수 없어요.',
}

/** Why a new password can't be used, or null when it can. */
export function passwordProblemIn(password: string, email: string | null | undefined, lang: Lang): string | null {
  const problem = passwordProblem(password, email)
  return problem && lang === 'ko' ? (PASSWORD_KO[problem] ?? problem) : problem
}

const AUTH_ERRORS_KO: Record<string, string> = {
  'Your current password isn’t right.': '현재 비밀번호가 맞지 않아요.',
  'That email and password don’t match. Check them, or reset your password.': '이메일이나 비밀번호가 맞지 않아요. 다시 확인하거나 비밀번호를 재설정해 주세요.',
  'That doesn’t look like an email address.': '올바른 이메일 주소가 아니에요.',
  'Enter your password.': '비밀번호를 입력해 주세요.',
  'There’s already an account with this email. Sign in instead, or reset the password if you forgot it.': '이 이메일로 만든 계정이 이미 있어요. 로그인하거나, 비밀번호가 기억나지 않으면 재설정해 주세요.',
  [`Choose a stronger password (at least ${PASSWORD_MIN_LENGTH} characters).`]: `${PASSWORD_MIN_LENGTH}자 이상으로 더 안전한 비밀번호를 정해 주세요.`,
  'Too many tries. Wait a few minutes, then try again.': '너무 여러 번 시도했어요. 몇 분 뒤에 다시 시도해 주세요.',
  'This account has been turned off. Contact your academy.': '사용이 중지된 계정이에요. 아카데미에 문의해 주세요.',
  'No connection. Check your internet and try again.': '인터넷에 연결되지 않았어요. 연결을 확인하고 다시 시도해 주세요.',
  'For your security, sign in again, then try once more.': '안전을 위해 다시 로그인한 뒤 한 번 더 시도해 주세요.',
  'This email already signs in with a password. Sign in with your email and password instead.': '이 이메일은 비밀번호로 로그인하는 계정이에요. 이메일과 비밀번호로 로그인해 주세요.',
  'That account is already linked to another sign-in.': '이 계정은 이미 다른 로그인 방법에 연결돼 있어요.',
  'Your account already has a password. Change it instead.': '이미 비밀번호가 있는 계정이에요. 비밀번호를 변경해 주세요.',
  'That’s a different account. Use the one you’re signed in with.': '다른 계정이에요. 지금 로그인한 계정을 사용해 주세요.',
  'Google sign-in isn’t turned on for Sky Arc yet.': '아직 Sky Arc에서 Google 로그인을 쓸 수 없어요.',
  'Signing in with a password isn’t turned on for Sky Arc yet.': '아직 Sky Arc에서 비밀번호 로그인을 쓸 수 없어요.',
  'This link has expired. Ask for a new one.': '링크가 만료됐어요. 새 링크를 요청해 주세요.',
  'This link has already been used or isn’t valid anymore. Ask for a new one.': '이미 사용했거나 더 이상 쓸 수 없는 링크예요. 새 링크를 요청해 주세요.',
  'Your browser blocked the Google window. Allow pop-ups for this site and try again.': '브라우저가 Google 창을 막았어요. 이 사이트의 팝업을 허용하고 다시 시도해 주세요.',
  'Sign-in isn’t allowed from this address.': '이 주소에서는 로그인할 수 없어요.',
  'Something went wrong on our side. Try again in a moment.': '저희 쪽에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  'Couldn’t send the email. Try again in a moment.': '이메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  'Couldn’t create the account. Try again in a moment.': '계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
  'Couldn’t change your password. Try again in a moment.': '비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.',
  'Couldn’t sign you in. Try again in a moment.': '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
}

/** A Firebase Auth error in plain words. */
export function authErrorIn(code: string | undefined | null, action: AuthAction, lang: Lang): string {
  const en = authErrorMessage(code, action)
  return lang === 'ko' ? (AUTH_ERRORS_KO[en] ?? en) : en
}

/** "Google, or email and password", "Google 또는 이메일과 비밀번호". */
export function signInWaysIn(m: SignInMethods, lang: Lang): string {
  if (lang !== 'ko') return signInWays(m)
  const providers = [m.google ? 'Google' : null, m.apple ? 'Apple' : null].filter(Boolean).join(' 또는 ')
  if (providers && m.password) return `${providers} 또는 이메일과 비밀번호`
  return providers || '이메일과 비밀번호'
}
