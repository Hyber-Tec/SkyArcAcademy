import { router, useLocalSearchParams } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { useState } from "react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ImageViewer } from "@/components/ImageViewer";
import { Screen } from "@/components/Screen";
import { postedAt } from "@/features/announcements/format";
import { PostAttachments, PostCard, PostLoading } from "@/features/announcements/PostParts";
import type { PostPicture } from "@/features/announcements/RichText";
import { useAcademyNow } from "@/features/data/hooks";
import { type NewsPost, useNewsPost, useReadReceipt } from "@/features/family/news";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * One of the academy's posts for families (loaded by ID, so a link opens it too): its category, pinned or not, the
 * title, who posted it and when (in the academy's zone), the content as the website's editor wrote it (RichText: a
 * picture opens full screen, a link in the phone's browser), and its attachments: pictures shown, as the website shows
 * them, and other files as rows; each opens full screen (news/attachment). Opening it leaves this person's read
 * receipt, once, so it stops being "New" for them. A post the academy archived, stopped showing to families or deleted
 * (or an unknown link) says it isn't available, in the website's words.
 */
export default function FamilyNewsPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { post, loading } = useNewsPost(id ?? null);
  useReadReceipt(post);

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
          title="This news isn’t available"
          text="It may have been taken down, or it isn’t shared with families."
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
      <Screen typing={false} testID="news-post-screen">
        <PostCard post={a} meta={`${a.authorName?.trim() || name} · ${postedAt(a, timezone, today, hour12)}`} onOpenPicture={setPicture} />
        <PostAttachments post={a} onOpen={(f) => router.push({ pathname: "/news/attachment", params: { id: a.id, path: f.path } })} />
      </Screen>
      <ImageViewer image={picture} onClose={() => setPicture(null)} />
    </>
  );
}
