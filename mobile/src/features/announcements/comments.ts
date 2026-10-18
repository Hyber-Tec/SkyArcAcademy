import { addDoc, collection, deleteDoc, doc, orderBy, query, serverTimestamp } from "@react-native-firebase/firestore";
import { ANNOUNCEMENT_COMMENT_MAX, type AnnouncementComment, cleanCommentText } from "@shared/comms";
import { COL, ROOT } from "@shared/paths";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { type Actor, useBranch } from "@/state/BranchProvider";

/**
 * A post's comments, the staff's only (families never see them), as the website reads and writes them
 * (web/src/features/announcements/api.ts): staff who may read the post read its comments; they write one when the post
 * takes comments (owners and admins whenever: the rules allow it), signed with their own email at the server's time;
 * each deletes their own, owners and admins any. The post's comment count is kept by a Cloud Function.
 */

export type CommentDoc = AnnouncementComment & { id: string };

const comments = (branchId: string, postId: string) => collection(db, ROOT.branches, branchId, COL.announcements, postId, "comments");

/** A post's comments, oldest first (a new one comes last at once, before the server has stamped it). */
export function usePostComments(postId: string | null) {
  const { branchId } = useBranch();
  return useQuery<AnnouncementComment>(postId ? `comments-${branchId}-${postId}` : null, () => query(comments(branchId, postId ?? ""), orderBy("createdAt", "asc")));
}

/**
 * Writes a comment, as the website does (its role as the website's portals word it: Admin for owners and admins). The
 * phone keeps it at once, so it shows in the list straight away, while the server confirms it; the promise settles then
 * (a refusal undoes it on the phone too).
 */
export function addComment(branchId: string, actor: Actor, isAdmin: boolean, postId: string, text: string): Promise<unknown> {
  const clean = cleanCommentText(text).slice(0, ANNOUNCEMENT_COMMENT_MAX);
  if (!clean) return Promise.resolve();
  return addDoc(comments(branchId, postId), {
    authorKey: actor.email,
    authorName: actor.name,
    authorRole: isAdmin ? "admin" : "coach",
    text: clean,
    createdAt: serverTimestamp(),
  });
}

/** Deletes a comment (the person's own; owners and admins any). Gone from the phone at once. */
export function deleteComment(branchId: string, postId: string, commentId: string): Promise<void> {
  return deleteDoc(doc(comments(branchId, postId), commentId));
}

/** Whether this person may delete a comment, as the rules say: their own, or any for owners and admins. */
export function mayDelete(c: Pick<AnnouncementComment, "authorKey">, actor: Actor, isAdmin: boolean): boolean {
  return isAdmin || c.authorKey === actor.email;
}
