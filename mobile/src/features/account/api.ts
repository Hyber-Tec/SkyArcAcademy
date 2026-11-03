import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential } from "@react-native-firebase/auth";
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { callable } from "@/lib/api";
import { confirmWithApple } from "@/lib/appleSignIn";
import { env } from "@/lib/env";
import { auth } from "@/lib/firebase";

/**
 * Proves again who is signed in (their password, Google or Apple), as Firebase asks before deleting an account or
 * adding a password. `apple` with `revoke` also revokes the app's Apple tokens, as Apple asks before deleting an account
 * (src/lib/appleSignIn.ts). False when the person closed Google's picker or Apple's sheet.
 */
export async function confirmIdentity(how: { password: string } | "google" | "apple", opts: { revoke?: boolean } = {}): Promise<boolean> {
  const user = auth.currentUser;
  if (!user?.email) throw Object.assign(new Error("Sign in first."), { code: "auth/no-current-user" });
  if (how === "apple") return confirmWithApple({ revoke: opts.revoke });
  if (how !== "google") {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, how.password));
    return true;
  }
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn({ loginHint: user.email });
    if (!isSuccessResponse(response)) return false;
    if (!response.data.idToken) throw new Error("Google did not send a sign-in token. Try again.");
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(response.data.idToken));
    return true;
  } catch (e) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return false;
    throw e;
  }
}

/** The website's own function (functions/src/account.ts): removes the sign-in and the personal profile. */
export const deleteMyAccount = callable<Record<string, never>, { ok: boolean }>("deleteMyAccount");
