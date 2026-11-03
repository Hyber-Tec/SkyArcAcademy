import { OAuthProvider, reauthenticateWithCredential, revokeToken, signInWithCredential, updateProfile } from "@react-native-firebase/auth";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { auth } from "./firebase";

/**
 * Sign in with Apple, on iPhones (docs/DECISIONS.md §31): people make their accounts in the app, and an app that offers
 * Google for that offers Apple too (Apple's guideline 4.8). Firebase checks Apple's token against a one-time nonce (its
 * SHA-256 goes to Apple). Android has no Apple button. An account deleted in the app has its Apple tokens revoked
 * first, as Apple asks of every app with Sign in with Apple.
 */

/** Whether this phone offers Sign in with Apple (an iPhone, in a build that has the capability). */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/** Apple's sheet, and the Firebase credential it gives. Null when the person closed it. */
async function appleCredential() {
  const rawNonce = Crypto.randomUUID();
  const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const apple = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
    });
    if (!apple.identityToken) throw new Error("Apple did not send a sign-in token. Try again.");
    const fullName = apple.fullName ? { givenName: apple.fullName.givenName ?? null, familyName: apple.fullName.familyName ?? null } : undefined;
    return { apple, credential: new OAuthProvider("apple.com").credential({ idToken: apple.identityToken, rawNonce, fullName }) };
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
}

/**
 * What to say when Apple's own sign-in didn't finish (its errors are `ERR_…`; closing the sheet isn't one): mostly a
 * phone not signed in to an Apple Account. Null for any other error (Firebase's, said by `authErrorMessage`).
 */
export function appleProblem(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("ERR_")
    ? "Sign in with Apple didn’t finish. Check that this phone is signed in to an Apple Account (Settings), or use another way to sign in."
    : null;
}

/** Signs in (or makes the account) with Apple. False when the person closed Apple's sheet. */
export async function signInWithApple(): Promise<boolean> {
  const got = await appleCredential();
  if (!got) return false;
  const { user } = await signInWithCredential(auth, got.credential);
  // Apple gives the name only the first time: keep it on the account (Android's Firebase doesn't take it from the credential).
  const name = [got.apple.fullName?.givenName, got.apple.fullName?.familyName].filter(Boolean).join(" ");
  if (name && !user.displayName) await updateProfile(user, { displayName: name }).catch(() => undefined);
  return true;
}

/**
 * Proves again who is signed in with Apple, as Firebase asks before deleting an account or adding a password; with
 * `revoke`, also revokes the app's Apple tokens (before deleting). False when the person closed Apple's sheet.
 */
export async function confirmWithApple({ revoke = false }: { revoke?: boolean } = {}): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Sign in first."), { code: "auth/no-current-user" });
  const got = await appleCredential();
  if (!got) return false;
  await reauthenticateWithCredential(user, got.credential);
  // Firebase revokes them with the academy's Sign in with Apple key (docs/publishing/apple/sign-in-with-apple.md); the
  // account is deleted even if that key isn't set up yet.
  if (revoke && got.apple.authorizationCode) await revokeToken(auth, got.apple.authorizationCode).catch(() => undefined);
  return true;
}
