import { Stack, router, useLocalSearchParams } from "expo-router";
import { ExternalLink, FileImage, FileText, Folder, UserRoundX } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { categoryOf } from "@shared/drive/files";
import { formatBytes } from "@shared/drive/model";
import { STUDENT_STATUS_LABELS, formatPhone } from "@shared/people";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { formatDateKey, formatInstant } from "@shared/time";
import { showActions } from "@/components/ActionSheet";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { SwipeToDelete } from "@/components/SwipeToDelete";
import { T } from "@/components/Text";
import { type EvaluationDoc, useAcademyNow, useStudent, useStudentClasses, useStudentEvaluations, useStudentFiles, useStudentPrivate } from "@/features/data/hooks";
import { classIdOf } from "@/features/schedule/classes";
import { timeRange } from "@/features/schedule/format";
import { deleteEvaluation } from "@/features/scores/api";
import { deleteScoreMessage, scorePer10, scoreTitle, scoreTotal } from "@/features/scores/format";
import { studentLine } from "@/features/students/format";
import { openWebsite } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

const SCORES_SHOWN = 6;
const FILES_SHOWN = 8;

/**
 * A student at a glance (loaded by ID, so it opens from anywhere): who they are, their parents a call, a text or an
 * email away (the office's only, as on the website), their next and last classes (a coach's own with them), their
 * latest scores (each opens its own screen, and swipes away to be deleted) and the files in their Drive folder. Other
 * changes are made on the website.
 */
export default function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, timezone, branchId, actor, isAdmin, portal } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const { today } = useAcademyNow();
  const student = useStudent(id ?? null);
  const profile = useStudentPrivate(id ?? null);
  const classes = useStudentClasses(id ?? null, today);
  const scores = useStudentEvaluations(id ?? null);
  const files = useStudentFiles(id ?? null);
  const s = student.data;

  if (student.loading) {
    return (
      <Screen testID="student-screen">
        <Skeleton height={96} rounded={radius.lg} />
        <Skeleton height={120} rounded={radius.lg} />
      </Screen>
    );
  }
  if (!s) {
    return (
      <Screen testID="student-screen">
        <EmptyState icon={<UserRoundX size={26} color={colors.mutedForeground} />} title="This student isn’t in the academy’s list" text="They may have been removed on the website." />
      </Screen>
    );
  }

  const askDelete = (e: EvaluationDoc) => confirmAsync({ title: "Delete this score?", message: deleteScoreMessage(e), confirmLabel: "Delete", destructive: true });
  const removeScore = (e: EvaluationDoc) =>
    void deleteEvaluation(branchId, actor, e.id, e).then(
      () => toast.success("Score deleted"),
      (err: unknown) => toast.error("Couldn’t delete the score", { description: err instanceof Error ? err.message : String(err) }),
    );
  const deleteAsked = async (e: EvaluationDoc) => {
    if (await askDelete(e)) removeScore(e);
  };

  const p = profile.data;
  const parents = (p?.parents ?? []).filter((x) => x.name || x.phone || x.email);
  const next = classes.next.slice(0, 3);
  const last = classes.last.slice(0, 3);
  const line = studentLine(s);
  return (
    <>
      <Stack.Screen options={{ title: s.name }} />
      <Screen testID="student-screen">
        <Card style={styles.head}>
          <Avatar name={s.name} size={56} />
          <View style={styles.grow}>
            <T variant="heading" numberOfLines={2}>
              {s.name}
            </T>
            {line ? <T tone="muted">{line}</T> : null}
          </View>
          <Badge tone={s.status === "enrolled" ? "success" : "secondary"}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
        </Card>

        {isAdmin ? (
          <ListSection title="Family" testID="student-family">
            {parents.map((x, i) => (
              <ListRow
                key={`${x.name}-${i}`}
                icon={<Avatar name={x.name || "?"} size={38} />}
                title={x.name || "Parent"}
                subtitle={[x.relation, x.phone ? formatPhone(x.phone) : x.email].filter(Boolean).join(" · ")}
                right={<ContactButtons phone={x.phone} email={x.email} name={x.name || "the parent"} />}
                testID={`student-parent-${i}`}
              />
            ))}
            {p && (p.phone || p.email) ? (
              <ListRow
                icon={<Avatar name={s.name} size={38} />}
                title={`${s.firstName || s.name} (student)`}
                subtitle={p.phone ? formatPhone(p.phone) : p.email}
                right={<ContactButtons phone={p.phone} email={p.email} name={s.name} />}
                testID="student-own-contact"
              />
            ) : null}
            {!profile.loading && !parents.length && !(p?.phone || p?.email) ? <ListRow title="No contacts yet" subtitle="Add the family’s phone and email on the website." /> : null}
            {profile.loading ? <ListRow title="Loading contacts…" /> : null}
          </ListSection>
        ) : null}

        <ListSection title="Classes" testID="student-classes">
          {next.map((c) => (
            <ListRow
              key={c.id}
              title={`${formatDateKey(c.dateKey, c.dateKey === today ? "monthDay" : "weekdayMedium")}${c.dateKey === today ? " (today)" : ""} · ${timeRange(c.startMin, c.endMin, hour12)}`}
              subtitle={[c.coachName, SESSION_STATUS_LABELS[c.status], c.note?.trim()].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: classIdOf(c) } })}
            />
          ))}
          {!classes.loading && !next.length ? <ListRow title="No classes ahead" subtitle={isAdmin ? "Nothing is booked from today on." : "None with you from today on."} /> : null}
          {last.map((c) => (
            <ListRow
              key={c.id}
              title={`${formatDateKey(c.dateKey, "weekdayMedium")} · ${timeRange(c.startMin, c.endMin, hour12)}`}
              subtitle={["Last time", c.coachName, SESSION_STATUS_LABELS[c.status]].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: classIdOf(c) } })}
            />
          ))}
        </ListSection>

        <ListSection
          title="Scores"
          detail={scores.data.length > SCORES_SHOWN ? `Latest ${SCORES_SHOWN} of ${scores.data.length}` : undefined}
          footer={scores.data.length ? "Swipe a score to the left to delete it, or hold it for more." : undefined}
          testID="student-scores"
        >
          {scores.data.slice(0, SCORES_SHOWN).map((e) => {
            const title = scoreTitle(e);
            const subtitle = `${formatDateKey(e.dateKey, "medium")} · ${e.shots} shots · total ${scoreTotal(e)}`;
            const open = () => router.push({ pathname: "/score/[id]", params: { id: e.id } });
            return (
              <SwipeToDelete
                key={e.id}
                onPress={open}
                onLongPress={() =>
                  showActions(`${title}, ${formatDateKey(e.dateKey, "medium")}`, [
                    { label: "Open", onPress: open },
                    { label: "Delete", destructive: true, onPress: () => void deleteAsked(e) },
                  ])
                }
                confirm={() => askDelete(e)}
                onDelete={() => removeScore(e)}
                accessibilityLabel={`${title}, ${subtitle}`}
                testID={`student-score-${e.id}`}
              >
                <ListRow
                  title={title}
                  subtitle={subtitle}
                  right={
                    <View style={styles.per10}>
                      <T variant="label">{scorePer10(e) ?? "–"}</T>
                      <T variant="tiny" tone="muted">
                        per 10
                      </T>
                    </View>
                  }
                  chevron
                />
              </SwipeToDelete>
            );
          })}
          {!scores.loading && !scores.data.length ? <ListRow title="No scores yet" subtitle="Scan a paper target, or add SIUS results on the website." /> : null}
        </ListSection>

        <ListSection title="Drive" detail={files.data.length > FILES_SHOWN ? `Newest ${FILES_SHOWN} of ${files.data.length}` : undefined} testID="student-files">
          {files.data.slice(0, FILES_SHOWN).map((f) => {
            const Icon = categoryOf(f.kind) === "image" ? FileImage : categoryOf(f.kind) === "pdf" ? FileText : Folder;
            const when = (f.uploadedAt as { toMillis?: () => number } | null)?.toMillis?.();
            return (
              <ListRow
                key={f.id}
                icon={
                  <RowIcon>
                    <Icon size={17} color={colors.foreground} />
                  </RowIcon>
                }
                title={f.name}
                subtitle={[when ? formatInstant(when, timezone, { dateStyle: "medium" }) : null, formatBytes(f.size), f.status === "uploading" ? "Uploading" : f.status === "error" ? "Upload failed" : null].filter(Boolean).join(" · ")}
                onPress={f.status === "ready" ? () => router.push({ pathname: "/file/[id]", params: { id: f.id } }) : undefined}
                testID={`student-file-${f.id}`}
              />
            );
          })}
          {!files.loading && !files.data.length ? <ListRow title="No files yet" subtitle="Scanned targets and SIUS results are filed here." /> : null}
        </ListSection>

        <Button variant="outline" icon={<ExternalLink size={18} color={colors.foreground} />} onPress={() => void openWebsite(`/${portal}/students/${s.id}`)} testID="student-open-website">
          Open on the website
        </Button>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, gap: 2 },
  per10: { alignItems: "flex-end" },
});
