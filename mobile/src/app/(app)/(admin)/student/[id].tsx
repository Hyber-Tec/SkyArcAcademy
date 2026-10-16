import { Stack, router, useLocalSearchParams } from "expo-router";
import { ExternalLink, FileImage, FileText, Folder, UserRoundX } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { categoryOf } from "@shared/drive/files";
import { formatBytes } from "@shared/drive/model";
import { STUDENT_STATUS_LABELS, formatPhone } from "@shared/people";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { POSITION_LABELS, SOURCE_LABELS, per10 } from "@shared/shooting/evaluation";
import { formatDateKey, formatInstant } from "@shared/time";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type EvaluationDoc, useAcademyNow, useStudent, useStudentClasses, useStudentEvaluations, useStudentFiles, useStudentPrivate } from "@/features/data/hooks";
import { classIdOf } from "@/features/schedule/classes";
import { timeRange } from "@/features/schedule/format";
import { studentLine } from "@/features/students/format";
import { openWebsite } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

const SCORES_SHOWN = 6;
const FILES_SHOWN = 8;

/** A score as the website writes it: SIUS totals with their decimal, paper cards whole. */
const total = (e: EvaluationDoc) => (e.source === "sius" ? e.total.toFixed(1) : String(e.total));

/**
 * A student at a glance (loaded by ID, so it opens from anywhere): who they are, their parents a call, a text or an
 * email away, their next and last classes, their latest scores and the files in their Drive folder. Changes are made
 * on the website.
 */
export default function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, timezone } = useBranch();
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

        <ListSection title="Classes" testID="student-classes">
          {next.map((c) => (
            <ListRow
              key={c.id}
              title={`${formatDateKey(c.dateKey, c.dateKey === today ? "monthDay" : "weekdayMedium")}${c.dateKey === today ? " (today)" : ""} · ${timeRange(c.startMin, c.endMin, hour12)}`}
              subtitle={[c.coachName, SESSION_STATUS_LABELS[c.status], c.note?.trim()].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: classIdOf(c) } })}
            />
          ))}
          {!classes.loading && !next.length ? <ListRow title="No classes ahead" subtitle="Nothing is booked from today on." /> : null}
          {last.map((c) => (
            <ListRow
              key={c.id}
              title={`${formatDateKey(c.dateKey, "weekdayMedium")} · ${timeRange(c.startMin, c.endMin, hour12)}`}
              subtitle={["Last time", c.coachName, SESSION_STATUS_LABELS[c.status]].filter(Boolean).join(" · ")}
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: classIdOf(c) } })}
            />
          ))}
        </ListSection>

        <ListSection title="Scores" detail={scores.data.length > SCORES_SHOWN ? `Latest ${SCORES_SHOWN} of ${scores.data.length}` : undefined} testID="student-scores">
          {scores.data.slice(0, SCORES_SHOWN).map((e) => (
            <ListRow
              key={e.id}
              title={`${POSITION_LABELS[e.position]} · ${SOURCE_LABELS[e.source]}`}
              subtitle={`${formatDateKey(e.dateKey, "medium")} · ${e.shots} shots · total ${total(e)}`}
              right={
                <View style={styles.per10}>
                  <T variant="label">{per10(e.source === "sius" ? e.total : e.wholeTotal, e.shots) ?? "–"}</T>
                  <T variant="tiny" tone="muted">
                    per 10
                  </T>
                </View>
              }
              onPress={e.fileId ? () => router.push({ pathname: "/file/[id]", params: { id: e.fileId! } }) : undefined}
              testID={`student-score-${e.id}`}
            />
          ))}
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

        <Button variant="outline" icon={<ExternalLink size={18} color={colors.foreground} />} onPress={() => void openWebsite(`/admin/students/${s.id}`)} testID="student-open-website">
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
