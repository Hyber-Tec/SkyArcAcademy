import { type AuthAction, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, authErrorMessage, passwordProblem } from "@shared/auth";
import type { Lang } from "@shared/i18n";

/**
 * Sign-in's words in the screen's language (docs/DECISIONS.md §36): shared/src/auth.ts says Firebase's errors and the
 * password rules in English; a parent reading Korean gets the same in Korean.
 */

/** A Firebase Auth error in plain words. */
export function authErrorText(code: string | undefined | null, action: AuthAction = "sign-in", lang: Lang = "en"): string {
  if (lang === "en") return authErrorMessage(code, action);
  switch ((code ?? "").replace(/^auth\//, "")) {
    case "invalid-credential":
    case "invalid-login-credentials":
    case "wrong-password":
    case "user-not-found":
      return action === "change-password" ? "현재 비밀번호가 맞지 않아요." : "이메일과 비밀번호가 맞지 않아요. 다시 확인하거나 비밀번호를 재설정해 주세요.";
    case "invalid-email":
      return "올바른 이메일 주소가 아니에요.";
    case "missing-password":
      return "비밀번호를 입력해 주세요.";
    case "email-already-in-use":
      return "이 이메일로 만든 계정이 이미 있어요. 로그인하거나, 비밀번호가 기억나지 않으면 재설정해 주세요.";
    case "weak-password":
    case "password-does-not-meet-requirements":
      return `비밀번호를 ${PASSWORD_MIN_LENGTH}자 이상으로 더 안전하게 정해 주세요.`;
    case "too-many-requests":
      return "시도가 너무 많았어요. 몇 분 뒤에 다시 해 주세요.";
    case "user-disabled":
      return "사용이 중지된 계정이에요. 아카데미에 문의해 주세요.";
    case "network-request-failed":
      return "인터넷에 연결되지 않았어요. 연결을 확인하고 다시 시도해 주세요.";
    case "requires-recent-login":
      return "보안을 위해 다시 로그인한 뒤 한 번 더 시도해 주세요.";
    case "account-exists-with-different-credential":
      return "이 이메일은 비밀번호로 로그인하는 계정이에요. 이메일과 비밀번호로 로그인해 주세요.";
    case "credential-already-in-use":
      return "이 계정은 이미 다른 로그인 방법에 연결돼 있어요.";
    case "provider-already-linked":
      return "이미 비밀번호가 있는 계정이에요. 비밀번호 변경을 이용해 주세요.";
    case "user-mismatch":
      return "다른 계정이에요. 지금 로그인한 계정으로 해 주세요.";
    case "operation-not-allowed":
      return action === "google" ? "아직 Google 로그인을 쓸 수 없어요." : "아직 비밀번호 로그인을 쓸 수 없어요.";
    case "expired-action-code":
      return "링크가 만료됐어요. 새 링크를 요청해 주세요.";
    case "invalid-action-code":
      return "이미 사용했거나 더는 쓸 수 없는 링크예요. 새 링크를 요청해 주세요.";
    case "unauthorized-domain":
      return "이 주소에서는 로그인할 수 없어요.";
    case "internal-error":
      return "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.";
    default:
      return action === "reset"
        ? "이메일을 보내지 못했어요. 조금 뒤에 다시 시도해 주세요."
        : action === "sign-up"
          ? "계정을 만들지 못했어요. 조금 뒤에 다시 시도해 주세요."
          : action === "change-password"
            ? "비밀번호를 바꾸지 못했어요. 조금 뒤에 다시 시도해 주세요."
            : "로그인하지 못했어요. 조금 뒤에 다시 시도해 주세요.";
  }
}

/** Why a new password can't be used, or null when it can (the shared rules, said in the language). */
export function passwordProblemText(password: string, email: string | null | undefined, lang: Lang = "en"): string | null {
  const problem = passwordProblem(password, email);
  if (!problem || lang === "en") return problem;
  if (password.length < PASSWORD_MIN_LENGTH) return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하로 정해 주세요.`;
  if (/^\s|\s$/.test(password)) return "비밀번호 앞뒤의 공백을 지워 주세요.";
  if (/^(.)\1+$/.test(password)) return "한 글자만 반복한 비밀번호는 쓸 수 없어요.";
  if (/email name/.test(problem)) return "이메일 아이디는 비밀번호로 쓸 수 없어요.";
  return "이메일 주소는 비밀번호로 쓸 수 없어요.";
}
