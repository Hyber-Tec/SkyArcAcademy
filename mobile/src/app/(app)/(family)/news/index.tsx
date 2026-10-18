import { router } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { postedMonth } from "@/features/announcements/format";
import { useAcademyNow } from "@/features/data/hooks";
import { type NewsPost, useFamilyNews, useIsNewNews } from "@/features/family/news";
import { NewsRow, NewsRowsLoading } from "@/features/family/NewsRow";
import { monthYear } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";

/**
 * The academy's news for families (opened from Home's "From the academy", or a link): every post the academy shows to
 * families, pinned first, then the rest month by month, newest first; "New" until this person opens one. A post opens
 * on its own screen. Live: a post the academy archives leaves the list at once.
 */
export default function FamilyNewsScreen() {
  const { name, timezone } = useBranch();
  const colors = useColors();
  const { today } = useAcademyNow();
  const news = useFamilyNews();
  const isNew = useIsNewNews();
  const open = (id: string) => router.push({ pathname: "/news/[id]", params: { id } });

  const pinned = news.data.filter((a) => a.pinned);
  // The rest month by month, in the list's order (newest first).
  const months: { key: string; posts: NewsPost[] }[] = [];
  for (const a of news.data) {
    if (a.pinned) continue;
    const key = postedMonth(a, timezone) || today.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.posts.push(a);
    else months.push({ key, posts: [a] });
  }
  const freshIn = (posts: NewsPost[]) => {
    const n = posts.filter((a) => isNew(a.id)).length;
    return n ? `${n} new` : undefined;
  };
  const rows = (posts: NewsPost[]) => posts.map((a) => <NewsRow key={a.id} post={a} isNew={isNew(a.id)} today={today} onPress={() => open(a.id)} testID={`family-news-${a.id}`} />);

  return (
    <Screen typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="family-news">
      {news.loading ? (
        <NewsRowsLoading count={4} testID="family-news-loading" />
      ) : news.error && !news.data.length ? (
        <Card>
          <T variant="label">Couldn’t load the news</T>
          <T variant="small" tone="muted">
            Check your connection, then pull down to try again.
          </T>
        </Card>
      ) : news.data.length ? (
        <>
          {pinned.length ? (
            <ListSection title="Pinned" detail={freshIn(pinned)} testID="family-news-pinned">
              {rows(pinned)}
            </ListSection>
          ) : null}
          {months.map((m) => (
            <ListSection key={m.key} title={monthYear(`${m.key}-01`)} detail={freshIn(m.posts)} testID={`family-news-month-${m.key}`}>
              {rows(m.posts)}
            </ListSection>
          ))}
        </>
      ) : (
        <EmptyState
          testID="family-news-empty"
          icon={<Megaphone size={26} color={colors.mutedForeground} />}
          title="No news yet"
          text={`${name} posts its news for families here: closures, matches and other updates.`}
        />
      )}
    </Screen>
  );
}
