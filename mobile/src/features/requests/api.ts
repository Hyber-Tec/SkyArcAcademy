import type { ClassRequestKind } from "@shared/schedule/requests";
import { callable, errorMessage } from "@/lib/api";

/**
 * Families cancel and ask for classes, and the office answers, through the server (functions/src/requests.ts), as the
 * website does (web/src/features/requests/api.ts): it checks each step with the shared rules
 * (`@shared/schedule/requests`), writes it with its audit entry and tells whoever needs to know. Families never write
 * the schedule themselves.
 */

type Decision = "approve" | "reject" | "offer";

const cancel = callable<{ branchId: string; sessionId: string; via: "app" }, { ok: true }>("cancelClass");
const ask = callable<{ branchId: string; studentId: string; kind: ClassRequestKind; classId: string; forSessionId: string | null; message: string }, { requestId: string }>("requestClass");
const withdraw = callable<{ branchId: string; requestId: string }, { ok: true }>("withdrawClassRequest");
const decide = callable<{ branchId: string; requestId: string; decision: Decision; note: string; classId?: string; via: "app" }, { ok: true; sessionId: string | null }>("decideClassRequest");
const answer = callable<{ branchId: string; requestId: string; answer: "accept" | "another"; classId: string; message: string; via: "app" }, { ok: true; sessionId: string | null }>("answerClassOffer");

/** The server's own words when it says no ("That class is full now…"), else a plain line. */
export const requestError = (e: unknown, fallback = "Please try again."): string => errorMessage(e, fallback);

export async function cancelClass(branchId: string, sessionId: string): Promise<void> {
  await cancel({ branchId, sessionId, via: "app" });
}

export async function requestClass(input: { branchId: string; studentId: string; kind: ClassRequestKind; classId: string; forSessionId: string | null; message: string }): Promise<string> {
  return (await ask(input)).requestId;
}

/** Takes back a request still open: waiting for the academy, or for the family's answer to a time suggested. */
export async function withdrawRequest(branchId: string, requestId: string): Promise<void> {
  await withdraw({ branchId, requestId });
}

/**
 * The office answers: approve (books the class asked for; `classId` is the one the office saw, so a class the family
 * changed since isn't booked unseen), decline with a note, or suggest another class (`offer`, with its `classId`).
 */
export async function decideRequest(branchId: string, requestId: string, decision: Decision, note = "", classId?: string): Promise<string | null> {
  return (await decide({ branchId, requestId, decision, note, ...(classId ? { classId } : {}), via: "app" })).sessionId;
}

/**
 * The family answers a class the academy suggested: accept it (`classId`: the suggestion they saw; it's booked if a
 * seat is still open), or ask for `classId` instead, with a message (the academy answers again).
 */
export async function answerOffer(branchId: string, requestId: string, reply: "accept" | "another", classId: string, message = ""): Promise<string | null> {
  return (await answer({ branchId, requestId, answer: reply, classId, message, via: "app" })).sessionId;
}
