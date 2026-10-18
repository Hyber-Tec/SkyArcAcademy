import { router, useLocalSearchParams } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ImageViewer } from "@/components/ImageViewer";
import { Screen } from "@/components/Screen";
import { PostComments } from "@/features/announcements/PostComments";
import { postedAt } from "@/features/announcements/format";
import { PostAttachments, PostCard, PostLoading } from "@/features/announcements/PostParts";
import type { PostPicture } from "@/features/announcements/RichText";
import { audienceLabel, useStaffPost } from "@/features/announcements/staffNews";
import { useAcademyNow } from "@/features/data/hooks";
import { type NewsPost, useReadReceipt } from "@/features/family/news";
import { useReadNoticesAbout } from "@/features/notifications/inbox";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * One of the academy's announcements for the staff (loaded by ID, so a link or a notification opens it too), as the
 * website's post page shows it: its chips, the title, who posted it and when (in the academy's zone), who it's for, the
 * content as the website's editor wrote it (a picture opens full screen, a link in the phone's browser), its
 * attachments (each opens full screen: news/attachment), and its comments, with a field to write one when the post
 * takes them. A coach opening it leaves their read receipt once (it stops being "New" for them; owners and admins
 * leave none, as on the website), and the person's notifications about it are read. A deleted post, or one that isn't
 * theirs, says it isn't available, in the website's words.
 */
export default function StaffNewsPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { isCoach } = useBranch();
  const { post, loading } = useStaffPost(id ?? null);
  useReadReceipt(isCoach ? post : null);
  useReadNoticesAbout(post?.id ?? null);

  if (loading) {
    return (
      <Screen typing={false} testID="news-post-screen">
        <PostLoading />
      </Screen>
    );
  }
  if (!post) {
    return (
      <Screen typing={false} testID="news-post-screen">
        <EmptyState
          testID="news-post-missing"
          icon={<Megaphone size={26} color={colors.mutedForeground} />}
          title="This announcement isn’t available"
          text="It may have been deleted, or it isn’t addressed to you."
          action={
            <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/news"))} testID="news-post-back">
              Back to news
            </Button>
          }
        />
      </Screen>
    );
  }
  return <PostBody a={post} />;
}

function PostBody({ a }: { a: NewsPost }) {
  const { timezone, settings, name } = useBranch();
  const { today } = useAcademyNow();
  const [picture, setPicture] = useState<PostPicture | null>(null);
  const hour12 = settings.general.timeFormat !== "24h";

  return (
    <>
      {/* A page with a comment field keeps it above the keyboard; without one the keyboard leaves it alone. */}
      <Screen typing={a.commentsEnabled === true} testID="news-post-screen">
        <PostCard post={a} meta={`${a.authorName?.trim() || name} · ${postedAt(a, timezone, today, hour12)}`} detail={audienceLabel(a)} onOpenPicture={setPicture} />
        <PostAttachments post={a} onOpen={(f) => router.push({ pathname: "/news/attachment", params: { id: a.id, path: f.path } })} />
        <PostComments post={a} />
      </Screen>
      <ImageViewer image={picture} onClose={() => setPicture(null)} />
    </>
  );
}
