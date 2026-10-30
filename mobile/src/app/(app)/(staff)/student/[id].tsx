import { Stack, router, useLocalSearchParams } from "expo-router";
import { CalendarDays, ExternalLink, HardDrive, Info, Target, Trophy, UserRoundX, Users } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { totalWithTens } from "@shared/shooting/evaluation";
import { formatBytes } from "@shared/drive/model";
import { STUDENT_STATUS_LABELS, formatPhone, gradeLabel, parentLabel } from "@shared/people";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import type { SessionStatus } from "@shared/settings/defaults";
import { formatDateKey, formatInstant } from "@shared/time";
import { showActions } from "@/components/ActionSheet";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { FactRow } from "@/components/FactRow";
import { ListRow, ListSection, RowIcon, ToneIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { SwipeToDelete } from "@/components/SwipeToDelete";
import { T } from "@/components/Text";
import { type EvaluationDoc, useAcademyNow, useStudent, useStudentClasses, useStudentEvaluations, useStudentFiles, useStudentPrivate } from "@/features/data/hooks";
import { timeRange } from "@/features/schedule/format";
import { deleteEvaluation } from "@/features/scores/api";
import { ResultKindChip } from "@/features/scores/kinds";
import { FileGlyph } from "@/features/drive/DriveIcons";
import { deleteScoreMessage, scorePer10, scoreTitle, scoreTones } from "@/features/scores/format";
import { studentLine } from "@/features/students/format";
import { openWebsite } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useStatusColors } from "@/theme";

const SCORES_SHOWN = 6;
const FILES_SHOWN = 8;

/**
 * A student at a glance (loaded by ID, so it opens from anywhere): who they are, their parents a call, a text or an
 * email away (the office's only, as on the website), their next and last classes (each opens its class) and every
 * class month by month (student/calendar), their latest scores (each opens its own screen, and swipes away to be
 * deleted), the files in their Drive folder, and the website's Info tab as a coach sees it (the student's own record,
 * never the office's private one). Other changes are made on the website.
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
  const tones = useMemo(() => scoreTones(scores.data), [scores.data]);
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
  const first = s.firstName || s.name.split(/\s+/)[0];
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
          <ListSection title="Family" icon={Users} tone="green" testID="student-family">
            {/* A parent's name is optional (F3): "Avery's parent", as the website says it, with their email under it. */}
            {parents.map((x, i) => (
              <ListRow
                key={`${x.name}-${i}`}
                icon={<Avatar name={x.name || x.email || "?"} size={38} />}
                title={parentLabel(x.name, first)}
                subtitle={[x.relation, x.phone ? formatPhone(x.phone) : null, !x.name || !x.phone ? x.email : null].filter(Boolean).join(" · ")}
                right={<ContactButtons phone={x.phone} email={x.email} name={parentLabel(x.name, first)} />}
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

        <ListSection title="Classes" icon={CalendarDays} tone="red" testID="student-classes">
          {next.map((c) => (
            <ListRow
              key={c.id}
              title={`${formatDateKey(c.dateKey, c.dateKey === today ? "monthDay" : "weekdayMedium")}${c.dateKey === today ? " (today)" : ""} · ${timeRange(c.startMin, c.endMin, hour12)}`}
              subtitle={<StatusLine status={c.status} rest={[c.note?.trim()]} />}
              onPress={c.classId ? () => router.push({ pathname: "/class/[id]", params: { id: c.classId } }) : undefined}
              testID={`student-class-${c.id}`}
            />
          ))}
          {!classes.loading && !next.length ? <ListRow title="No classes ahead" subtitle="Nothing is booked from today on." /> : null}
          {last.map((c) => (
            <ListRow
              key={c.id}
              title={`${formatDateKey(c.dateKey, "weekdayMedium")} · ${timeRange(c.startMin, c.endMin, hour12)}`}
              subtitle={<StatusLine lead="Last time" status={c.status} rest={[c.note?.trim()]} />}
              onPress={c.classId ? () => router.push({ pathname: "/class/[id]", params: { id: c.classId } }) : undefined}
              testID={`student-class-${c.id}`}
            />
          ))}
          <ListRow
            icon={<ToneIcon icon={CalendarDays} tone="red" />}
            title="Calendar"
            subtitle="Every class, month by month"
            onPress={() => router.push({ pathname: "/student/calendar", params: { id: s.id } })}
            testID="student-calendar-open"
          />
        </ListSection>

        <ListSection
          title="Scores"
          icon={Target}
          tone="blue"
          detail={scores.data.length > SCORES_SHOWN ? `Latest ${SCORES_SHOWN} of ${scores.data.length}` : undefined}
          footer={scores.data.length ? "Swipe a score to the left to delete it, or hold it for more." : undefined}
          testID="student-scores"
        >
          {scores.data.slice(0, SCORES_SHOWN).map((e) => {
            const title = scoreTitle(e);
            const subtitle = `${formatDateKey(e.dateKey, "medium")} · ${e.shots} shots · total ${totalWithTens(e)}`;
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
                  title={
                    <View style={styles.scoreTitle}>
                      <T variant="label" numberOfLines={1} style={styles.shrink}>
                        {title}
                      </T>
                      <ResultKindChip e={e} />
                    </View>
                  }
                  subtitle={subtitle}
                  right={
                    <View style={styles.per10}>
                      <T variant="label" style={tones.get(e.id) === "high" ? { color: colors.success } : tones.get(e.id) === "low" ? { color: colors.warning } : undefined}>
                        {scorePer10(e) ?? "–"}
                      </T>
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
          <ListRow
            icon={<ToneIcon icon={Trophy} tone="amber" />}
            title="Add a competition"
            subtitle="From a photo of the results sheet"
            onPress={() => router.push({ pathname: "/scan/sheet", params: { studentId: s.id } })}
            testID="student-add-competition"
          />
        </ListSection>

        <ListSection title="Drive" icon={HardDrive} tone="amber" detail={files.data.length > FILES_SHOWN ? `Newest ${FILES_SHOWN} of ${files.data.length}` : undefined} testID="student-files">
          {files.data.slice(0, FILES_SHOWN).map((f) => {
            const when = (f.uploadedAt as { toMillis?: () => number } | null)?.toMillis?.();
            return (
              <ListRow
                key={f.id}
                icon={
                  <RowIcon>
                    <FileGlyph kind={f.kind} size={18} />
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

        {/* The website's Info tab, the part coaches see: the student's own record (contacts and family stay the office's). */}
        <ListSection title="Info" icon={Info} footer={isAdmin ? "Coaches see these too. Change them on the website." : "What admins have on file for this student."} testID="student-info">
          <FactRow label="First name" value={s.firstName || "—"} />
          <FactRow label="Last name" value={s.lastName || "—"} />
          <FactRow label="Grade" value={s.grade ? gradeLabel(s.grade) : "—"} />
          <FactRow label="Level" value={s.level || "—"} />
          <FactRow label="Program" value={s.program || "—"} />
          <FactRow label="Rifle" value={s.rifle || "—"} />
          <FactRow label="Status" value={<Badge tone={s.status === "enrolled" ? "success" : "secondary"}>{STUDENT_STATUS_LABELS[s.status]}</Badge>} />
          <FactRow label="School" value={s.school || "—"} />
          <FactRow label="Sign-up date" value={s.signUpDate ? formatDateKey(s.signUpDate, "medium") : "—"} />
          <FactRow label="First class" value={s.firstSessionDate ? formatDateKey(s.firstSessionDate, "medium") : "—"} />
          <FactRow label="Last class" value={s.lastSessionDate ? formatDateKey(s.lastSessionDate, "medium") : "—"} />
        </ListSection>

        <Button variant="outline" icon={<ExternalLink size={18} color={colors.foreground} />} onPress={() => void openWebsite(`/${portal}/students/${s.id}`)} testID="student-open-website">
          Open on the website
        </Button>
      </Screen>
    </>
  );
}

/** A class row's line: its status in the status's colour (here blue, pending amber, canceled red), then the rest. */
function StatusLine({ lead, status, rest }: { lead?: string; status: SessionStatus; rest: (string | undefined)[] }) {
  const tones = useStatusColors();
  const after = rest.filter(Boolean).join(" · ");
  return (
    <T variant="small" tone="muted" numberOfLines={2}>
      {lead ? `${lead} · ` : ""}
      <T variant="small" style={{ color: tones[status].text, fontWeight: "600" }}>
        {SESSION_STATUS_LABELS[status]}
      </T>
      {after ? ` · ${after}` : ""}
    </T>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, gap: 2 },
  per10: { alignItems: "flex-end" },
  scoreTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  shrink: { flexShrink: 1 },
});
