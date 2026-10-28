import type { ClassRequestKind } from "@shared/schedule/requests";
import { callable, errorMessage } from "@/lib/api";

/**
 * Families cancel and ask for classes, and the office answers, through the server (functions/src/requests.ts), as the
 * website does (web/src/features/requests/api.ts): it checks each step with the shared rules
 * (`@shared/schedule/requests`), writes it with its audit entry and tells whoever needs to know. Families never write
 * the schedule themselves.
 */

const cancel = callable<{ branchId: string; sessionId: string; via: "app" }, { ok: true }>("cancelClass");
const ask = callable<{ branchId: string; studentId: string; kind: ClassRequestKind; classId: string; forSessionId: string | null; message: string }, { requestId: string }>("requestClass");
const withdraw = callable<{ branchId: string; requestId: string }, { ok: true }>("withdrawClassRequest");
const decide = callable<{ branchId: string; requestId: string; decision: "approve" | "reject"; note: string; via: "app" }, { ok: true; sessionId: string | null }>("decideClassRequest");

/** The server's own words when it says no ("That class is full now…"), else a plain line. */
export const requestError = (e: unknown, fallback = "Please try again."): string => errorMessage(e, fallback);

export async function cancelClass(branchId: string, sessionId: string): Promise<void> {
  await cancel({ branchId, sessionId, via: "app" });
}

export async function requestClass(input: { branchId: string; studentId: string; kind: ClassRequestKind; classId: string; forSessionId: string | null; message: string }): Promise<string> {
  return (await ask(input)).requestId;
}

export async function withdrawRequest(branchId: string, requestId: string): Promise<void> {
  await withdraw({ branchId, requestId });
}

export async function decideRequest(branchId: string, requestId: string, decision: "approve" | "reject", note = ""): Promise<string | null> {
  return (await decide({ branchId, requestId, decision, note, via: "app" })).sessionId;
}
