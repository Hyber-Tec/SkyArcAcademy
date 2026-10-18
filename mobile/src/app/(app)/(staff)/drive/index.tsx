import { DRIVE_DEFAULT_SORT, DRIVE_SEARCH_LIMIT, type DriveHit, countLabel, formatBytes, levelItems, sortDriveItems } from "@shared/drive/model";
import { Stack } from "expo-router";
import { HardDrive, Plus, SearchX } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { AddButtons, Adding } from "@/features/drive/DriveParts";
import { DriveSection } from "@/features/drive/DriveSection";
import { useDriveActions } from "@/features/drive/useDriveActions";
import { reloadDrive, useDriveIndex } from "@/features/drive/useDriveIndex";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/** Files shown at the top of the Drive before "Show all". */
const FILES_SHOWN = 40;

/**
 * The Drive, as the website's (web/src/features/drive/DrivePage.tsx): every student's folder at the top, A to Z, then
 * the academy's other folders, then the files at the top of the Drive, newest first. The search looks through the
 * whole Drive by name (every word must be in it) and says where each match is. A folder opens its own screen, a file
 * its viewer; "…" or a long press offers the rest, and + adds photos or a folder. Coaches and the office alike; the
 * Trash, SIUS results and other files are on the website.
 */
export default function DriveScreen() {
  const colors = useColors();
  const { branchId } = useBranch();
  const index = useDriveIndex();
  const actions = useDriveActions(index, null);
  const [q, setQ] = useState("");
  const query = q.trim();
  const ready = !index.loading && !index.error;

  const hits = useMemo<DriveHit[]>(() => (ready && query ? sortDriveItems(index.search(query), DRIVE_DEFAULT_SORT, index) : []), [ready, query, index]);
  const top = useMemo(() => (ready ? sortDriveItems(levelItems(index, null), DRIVE_DEFAULT_SORT, index) : []), [ready, index]);
  const students = top.filter((it) => it.kind === "folder" && !!it.folder.studentId);
  const folders = top.filter((it) => it.kind === "folder" && !it.folder.studentId);
  const files = top.filter((it) => it.kind === "file");

  // Still loading after a while (offline, with nothing of the Drive on this phone yet): say so.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!index.loading) return;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [index.loading]);

  const header = (
    <Stack.Screen
      options={{
        title: "Drive",
        headerRight: () =>
          ready ? <IconButton icon={<Plus size={22} color={colors.foreground} />} accessibilityLabel="Add to the Drive" onPress={() => actions.add(null)} size={36} testID="drive-add" /> : null,
      }}
    />
  );

  let body;
  if (index.error) {
    body = (
      <Card>
        <T variant="label">Couldn’t load the Drive</T>
        <T variant="small" tone="muted">
          Check your connection, then pull down to try again.
        </T>
      </Card>
    );
  } else if (!ready) {
    body = (
      <>
        <SkeletonCards count={5} height={60} />
        {slow ? (
          <T variant="small" tone="muted" style={styles.note}>
            Still loading the Drive. Check this phone’s connection.
          </T>
        ) : null}
      </>
    );
  } else if (query) {
    body = hits.length ? (
      <DriveSection
        title={`${countLabel(hits.length, "result")}`}
        detail={hits.length > DRIVE_SEARCH_LIMIT ? `First ${DRIVE_SEARCH_LIMIT}` : undefined}
        items={hits.slice(0, DRIVE_SEARCH_LIMIT)}
        index={index}
        actions={actions}
        where={(it) => (it as DriveHit).where}
        testID="drive-results"
      />
    ) : (
      <EmptyState testID="drive-no-results" icon={<SearchX size={26} color={colors.mutedForeground} />} title={`Nothing in the Drive matches “${query}”`} text="The search looks at the names of every folder and file." />
    );
  } else if (!top.length) {
    body = (
      <EmptyState
        testID="drive-empty"
        icon={<HardDrive size={26} color={colors.mutedForeground} />}
        title="Nothing in the Drive yet"
        text="Add photos from this phone, or make a folder. SIUS PDFs and other files are added on the website."
        action={<AddButtons onPhotos={() => void actions.addPhotos(null)} onFolder={() => actions.newFolder(null)} />}
      />
    );
  } else {
    body = (
      <>
        <DriveSection title="Students" detail={String(students.length)} items={students} index={index} actions={actions} testID="drive-students" />
        <DriveSection title="Folders" detail={String(folders.length)} items={folders} index={index} actions={actions} testID="drive-folders" />
        <DriveSection title="Files" detail={String(files.length)} items={files} index={index} actions={actions} limit={FILES_SHOWN} testID="drive-files" />
        <T variant="small" tone="muted" style={styles.note} testID="drive-used">
          {formatBytes(index.countsOf(null).bytes)} in the Drive, not counting its Trash.
        </T>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen
        testID="drive-screen"
        onRefresh={() => {
          reloadDrive(branchId);
          return new Promise((r) => setTimeout(r, 600));
        }}
      >
        <SearchField value={q} onChangeText={setQ} placeholder="Search the Drive" testID="drive-search" />
        {actions.adding ? <Adding count={actions.adding} /> : null}
        {body}
      </Screen>
      {actions.dialogs}
    </>
  );
}

const styles = StyleSheet.create({
  note: { paddingHorizontal: space.xs },
});
