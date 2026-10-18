import { announcementCategories } from "@shared/comms";
import { router } from "expo-router";
import { Megaphone, SearchX } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { T } from "@/components/Text";
import { postedMonth } from "@/features/announcements/format";
import { useNewsReads, useStaffNews } from "@/features/announcements/staffNews";
import { useAcademyNow } from "@/features/data/hooks";
import type { NewsPost } from "@/features/family/news";
import { NewsRow, NewsRowsLoading } from "@/features/family/NewsRow";
import { monthYear } from "@/features/schedule/format";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

const categoryOf = (a: NewsPost) => a.category?.trim() || "General";

/**
 * The academy's announcements for the staff (the website's Announcements page; opened from More, Home's to-do or a
 * notification): the posts the person may read (a coach's for everyone and those addressed to them; every one for the
 * office), pinned first, then the rest month by month, newest first, each with its comments' count. "New" until a
 * coach opens one. A search (title, text, author) and the categories in use narrow the list, as on the website. Posts
 * are written on the website. Live: a post archived there leaves the list at once.
 */
export default function StaffNewsScreen() {
  const { timezone, settings, isAdmin } = useBranch();
  const colors = useColors();
  const { today } = useAcademyNow();
  const news = useStaffNews();
  const { isNew } = useNewsReads();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const open = (id: string) => router.push({ pathname: "/news/[id]", params: { id } });

  // The academy's usual categories first, then the others in use, A to Z: only those that have a post.
  const categories = useMemo(() => {
    const used = news.data.map(categoryOf);
    const present = new Set(used.map((c) => c.toLowerCase()));
    return announcementCategories(settings.announcements.defaultCategories, used).filter((c) => present.has(c.toLowerCase()));
  }, [news.data, settings.announcements.defaultCategories]);
  const options = [
    { value: "all", label: "All", testID: "staff-news-filter-all" },
    ...(news.data.some((a) => a.pinned) ? [{ value: "pinned", label: "Pinned", testID: "staff-news-filter-pinned" }] : []),
    ...categories.map((c) => ({ value: `cat:${c.toLowerCase()}`, label: c, testID: `staff-news-filter-${c.toLowerCase().replace(/\s+/g, "-")}` })),
  ];
  // A filter whose posts have gone (the last post of a category archived) is All again.
  const chosen = options.some((o) => o.value === filter) ? filter : "all";

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return news.data
      .filter((a) => chosen !== "pinned" || a.pinned)
      .filter((a) => !chosen.startsWith("cat:") || categoryOf(a).toLowerCase() === chosen.slice(4))
      .filter((a) => !q || [a.title, a.contentText, a.authorName].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [news.data, chosen, search]);

  const pinned = shown.filter((a) => a.pinned);
  // The rest month by month, in the list's order (newest first).
  const months: { key: string; posts: NewsPost[] }[] = [];
  for (const a of shown) {
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
  const rows = (posts: NewsPost[]) =>
    posts.map((a) => <NewsRow key={a.id} post={a} isNew={isNew(a.id)} today={today} comments={a.commentCount ?? 0} onPress={() => open(a.id)} testID={`staff-news-${a.id}`} />);

  return (
    <Screen onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="staff-news">
      {news.data.length ? (
        <View style={styles.controls}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search announcements" testID="staff-news-search" />
          {options.length > 2 ? <FilterChips value={chosen} onChange={setFilter} options={options} testID="staff-news-filter" /> : null}
        </View>
      ) : null}

      {news.loading ? (
        <NewsRowsLoading count={4} testID="staff-news-loading" />
      ) : news.error && !news.data.length ? (
        <Card>
          <T variant="label">Couldn’t load the announcements</T>
          <T variant="small" tone="muted">
            Check your connection, then pull down to try again.
          </T>
        </Card>
      ) : !news.data.length ? (
        <EmptyState
          testID="staff-news-empty"
          icon={<Megaphone size={26} color={colors.mutedForeground} />}
          title="No announcements yet"
          text={isAdmin ? "Announcements are written on the website. They show here for you, and for the coaches they’re for." : "The academy’s posts for coaches show here: schedule changes, matches and other updates."}
          action={
            isAdmin ? (
              <Button variant="outline" onPress={() => void openWebsite("/admin/announcements")} testID="staff-news-website">
                Open the website
              </Button>
            ) : undefined
          }
        />
      ) : !shown.length ? (
        <EmptyState
          testID="staff-news-no-match"
          icon={<SearchX size={26} color={colors.mutedForeground} />}
          title="No announcement matches"
          text={search.trim() ? `Nothing found for “${search.trim()}”. Try another word${chosen === "all" ? "" : ", or All"}.` : "Try All."}
        />
      ) : (
        <>
          {pinned.length ? (
            <ListSection title="Pinned" detail={freshIn(pinned)} testID="staff-news-pinned">
              {rows(pinned)}
            </ListSection>
          ) : null}
          {months.map((m) => (
            <ListSection key={m.key} title={monthYear(`${m.key}-01`)} detail={freshIn(m.posts)} testID={`staff-news-month-${m.key}`}>
              {rows(m.posts)}
            </ListSection>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.md },
});
