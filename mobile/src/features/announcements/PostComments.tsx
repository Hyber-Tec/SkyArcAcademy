import { ANNOUNCEMENT_COMMENT_MAX, cleanCommentText } from "@shared/comms";
import { Send } from "lucide-react-native";
import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button, useButtonForeground } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { Field } from "@/components/Field";
import { SectionTitle } from "@/components/SectionTitle";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import type { NewsPost } from "@/features/family/news";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { type CommentDoc, addComment, deleteComment, mayDelete, usePostComments } from "./comments";
import { postedAt } from "./format";

/**
 * A post's comments, as the website shows them to the staff (families never see them): oldest first, each with who
 * wrote it (owners and admins marked Admin) and when, in the academy's zone; a person deletes their own (owners and
 * admins any, as on the website) once they've confirmed. When the post takes comments, a field to write one: it shows
 * at once and goes to the server in the background; if the server refuses it, it says so and the text comes back.
 * When it doesn't, it says comments are turned off.
 */
export function PostComments({ post }: { post: NewsPost }) {
  const { branchId, actor, isAdmin, timezone, settings } = useBranch();
  const colors = useColors();
  const sendColor = useButtonForeground("default");
  const { today } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const comments = usePostComments(post.id);
  const [text, setText] = useState("");
  const open = post.commentsEnabled === true;
  const list = comments.data;

  const send = () => {
    const body = text;
    if (!cleanCommentText(body)) return;
    setText("");
    Keyboard.dismiss();
    addComment(branchId, actor, isAdmin, post.id, body).catch(() => {
      toast.error("Couldn’t post your comment", { description: "It’s back in the field, to try again." });
      // Back in the field, unless something new was typed meanwhile.
      setText((now) => now || body);
    });
  };

  const remove = async (c: CommentDoc) => {
    const own = c.authorKey === actor.email;
    const ok = await confirmAsync({
      title: own ? "Delete your comment?" : c.authorName ? `Delete ${c.authorName}’s comment?` : "Delete this comment?",
      message: "It’s removed from the post for everyone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    deleteComment(branchId, post.id, c.id).catch(() => toast.error("Couldn’t delete the comment"));
  };

  const line = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  return (
    <View style={styles.section} testID="news-comments">
      <SectionTitle title="Comments" detail={list.length ? String(list.length) : undefined} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {comments.loading ? (
          <View style={styles.comment}>
            <Skeleton width={32} height={32} rounded={16} />
            <View style={styles.grow}>
              <Skeleton width="40%" height={14} />
              <Skeleton width="85%" height={13} />
            </View>
          </View>
        ) : (
          list.map((c, i) => (
            <View key={c.id} style={[styles.comment, i > 0 && line]} testID={`news-comment-${c.id}`}>
              <Avatar name={c.authorName || "?"} size={32} />
              <View style={styles.grow}>
                <View style={styles.head}>
                  <T variant="label" numberOfLines={1} style={styles.shrink}>
                    {c.authorName || "Someone"}
                  </T>
                  {c.authorRole === "admin" || c.authorRole === "owner" ? <Badge tone="outline">Admin</Badge> : null}
                  <View style={styles.grow} />
                  {mayDelete(c, actor, isAdmin) ? (
                    <Pressable
                      onPress={() => void remove(c)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={c.authorKey === actor.email ? "Delete your comment" : c.authorName ? `Delete ${c.authorName}’s comment` : "Delete this comment"}
                      testID={`news-comment-delete-${c.id}`}
                    >
                      {({ pressed }) => (
                        <T variant="small" tone="muted" style={[styles.delete, pressed && { color: colors.destructive }]}>
                          Delete
                        </T>
                      )}
                    </Pressable>
                  ) : null}
                </View>
                <T variant="small" tone="muted">
                  {postedAt(c, timezone, today, hour12)}
                </T>
                <T selectable style={styles.text}>
                  {c.text}
                </T>
              </View>
            </View>
          ))
        )}

        {!comments.loading && !list.length && open ? (
          <T tone="muted" style={styles.note} testID="news-comments-empty">
            No comments yet.
          </T>
        ) : null}

        {open ? (
          <View style={[styles.composer, (comments.loading || list.length > 0) && line]}>
            <Field
              value={text}
              onChangeText={setText}
              placeholder="Write a comment…"
              accessibilityLabel="Write a comment"
              multiline
              maxLength={ANNOUNCEMENT_COMMENT_MAX}
              style={styles.field}
              testID="news-comment-field"
            />
            <Button size="sm" icon={<Send size={15} color={sendColor} />} onPress={send} disabled={!text.trim()} style={styles.post} testID="news-comment-post">
              Post comment
            </Button>
          </View>
        ) : (
          <T tone="muted" style={[styles.note, (comments.loading || list.length > 0) && line]} testID="news-comments-off">
            Comments are turned off for this post.
          </T>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  comment: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  grow: { flex: 1, gap: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  shrink: { flexShrink: 1 },
  delete: { fontWeight: "600" },
  text: { marginTop: space.xs, lineHeight: 21 },
  note: { paddingHorizontal: space.lg, paddingVertical: space.md },
  composer: { gap: space.sm, padding: space.md },
  field: { minHeight: 88 },
  post: { alignSelf: "flex-end" },
});
