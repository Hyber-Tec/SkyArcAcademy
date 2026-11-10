import { type AuthAction, authErrorMessage, passwordProblem } from "@shared/auth";

/**
 * Sign-in's words in the screen's language (docs/DECISIONS.md §36): shared/src/auth.ts says Firebase's errors and the
 * password rules in English; a parent reading Korean gets the same in Korean.
 */

/** A Firebase Auth error in plain words. */
export function authErrorText(code: string | undefined | null, action: AuthAction = "sign-in"): string {
  return authErrorMessage(code, action);
}

/** Why a new password can't be used, or null when it can (the shared rules, said in the language). */
export function passwordProblemText(password: string, email: string | null | undefined): string | null {
  const problem = passwordProblem(password, email);
  return problem;
}
