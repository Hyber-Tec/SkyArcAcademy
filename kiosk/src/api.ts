import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { api?: string; branchId?: string };
/** The server's functions (app.config.ts) and the academy this tablet clocks for. */
export const API = (extra.api ?? "https://us-central1-skyarcacademy.cloudfunctions.net").replace(/\/+$/, "");
export const BRANCH_ID = extra.branchId ?? "skyarc";
export const APP_VERSION = `${Constants.expoConfig?.version ?? "?"} (${Constants.expoConfig?.android?.versionCode ?? "?"})`;

/** A refusal from the server, with its reason ("unauthenticated": this tablet isn't registered anymore). */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: string,
  ) {
    super(message);
  }
}

/** Calls a Cloud Function the way Firebase's callables take it (a POST of { data }), with a time limit. */
export async function call<T>(name: string, data: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
      signal: abort.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { result?: T; error?: { message?: string; status?: string } };
    if (body.error || !res.ok) throw new ServerError(body.error?.message || `The server answered ${res.status}.`, body.error?.status ?? "UNKNOWN");
    return body.result as T;
  } finally {
    clearTimeout(timer);
  }
}
