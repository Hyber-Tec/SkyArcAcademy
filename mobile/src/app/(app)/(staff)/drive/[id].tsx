import { DRIVE_DEFAULT_SORT, formatBytes, levelItems, sortDriveItems } from "@shared/drive/model";
import { Stack, router, useLocalSearchParams, useNavigation } from "expo-router";
import { Ellipsis, FolderOpen, FolderX, Plus, UserRound } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { Screen } from "@/components/Screen";
import { Skeleton, SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useStudentEvaluations } from "@/features/data/hooks";
import { FolderGlyph } from "@/features/drive/DriveIcons";
import { AddButtons, Adding, Crumbs } from "@/features/drive/DriveParts";
import { contentsText } from "@/features/drive/DriveRow";
import { DriveSection } from "@/features/drive/DriveSection";
import { useDriveActions } from "@/features/drive/useDriveActions";
import { reloadDrive, useDriveIndex } from "@/features/drive/useDriveIndex";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/** Files shown in a folder before "Show all". */
const FILES_SHOWN = 60;

/**
 * A folder of the Drive (loaded by ID, so a link opens it too): its name and where it is (each part of the way a tap
 * away), what it holds, its folders A to Z and its files newest first. In a student's folder each result shows its
 * score (a tap on it opens the score), and the student's page is a tap away. "…" or a long press offers what can be
 * done with each, and with the folder itself; + adds photos or a folder here.
 */
export default function DriveFolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const colors = useColors();
  const { branchId } = useBranch();
  const index = useDriveIndex();
  const folder = id ? index.folderOf(id) : null;
  const actions = useDriveActions(index, folder?.id ?? null);
  const studentId = folder ? index.studentOf(folder.id) : null;
  const scores = useStudentEvaluations(studentId);
  const scoresByFile = useMemo(() => new Map(scores.data.filter((e) => e.fileId).map((e) => [e.fileId as string, e])), [scores.data]);
  const items = useMemo(() => (folder ? sortDriveItems(levelItems(index, folder.id), DRIVE_DEFAULT_SORT, index) : []), [index, folder]);
  const folders = items.filter((it) => it.kind === "folder");
  const files = items.filter((it) => it.kind === "file");

  /** Goes to a folder up the way (or the top): back to it when it's an earlier screen, else opens it. */
  const goTo = (target: string | null) => {
    const state = navigation.getState();
    const routes = state?.routes ?? [];
    const at = state?.index ?? routes.length - 1;
    for (let i = at - 1; i >= 0; i--) {
      const r = routes[i];
      const params = r.params as { id?: string } | undefined;
      if (target === null ? r.name === "drive/index" : r.name === "drive/[id]" && params?.id === target) return router.dismiss(at - i);
    }
    if (target === null) router.push("/drive");
    else router.push({ pathname: "/drive/[id]", params: { id: target } });
  };

  const refresh = () => {
    reloadDrive(branchId);
    return new Promise((r) => setTimeout(r, 600));
  };

  if (index.loading) {
    return (
      <Screen testID="drive-folder-screen">
        <Skeleton height={110} rounded={radius.lg} />
        <SkeletonCards count={4} height={60} />
      </Screen>
    );
  }
  if (index.error || !folder) {
    return (
      <Screen testID="drive-folder-screen" onRefresh={refresh}>
        <Stack.Screen options={{ title: "" }} />
        {index.error ? (
          <Card>
            <T variant="label">Couldn’t load the Drive</T>
            <T variant="small" tone="muted">
              Check your connection, then pull down to try again.
            </T>
          </Card>
        ) : (
          <EmptyState
            testID="drive-folder-gone"
            icon={<FolderX size={26} color={colors.mutedForeground} />}
            title="This folder isn’t in the Drive"
            text="It may have been moved to the Trash, or into a folder that was."
            action={
              <Button variant="outline" onPress={() => goTo(null)} testID="drive-folder-gone-top">
                Go to the Drive
              </Button>
            }
          />
        )}
      </Screen>
    );
  }

  const counts = index.countsOf(folder.id);
  const contents = contentsText(index, folder.id);
  return (
    <>
      <Stack.Screen
        options={{
          title: folder.name,
          headerRight: () => <IconButton icon={<Plus size={22} color={colors.foreground} />} accessibilityLabel={`Add to ${folder.name}`} onPress={() => actions.add(folder.id)} size={36} testID="drive-add" />,
        }}
      />
      <Screen testID="drive-folder-screen" typing={false} onRefresh={refresh}>
        <Card style={styles.head} testID="drive-folder-head">
          <View style={styles.headTop}>
            <FolderGlyph student={!!folder.studentId} size={44} />
            <View style={styles.grow}>
              <T variant="heading" testID="drive-folder-name">
                {folder.name}
              </T>
              <Crumbs path={index.pathOf(folder.parentId)} onOpen={goTo} />
            </View>
            {/* A student's folder can't be renamed, moved or trashed: its page is the button below. */}
            {folder.studentId ? null : (
              <IconButton icon={<Ellipsis size={20} color={colors.mutedForeground} />} accessibilityLabel={`More for ${folder.name}`} onPress={() => actions.folderMenu(folder, true)} size={36} testID="drive-folder-more" />
            )}
          </View>
          <T variant="small" tone="muted">
            {contents}
            {counts.bytes ? ` · ${formatBytes(counts.bytes)}` : ""}
          </T>
          {folder.studentId ? (
            <Button
              variant="outline"
              icon={<UserRound size={18} color={colors.foreground} />}
              onPress={() => router.push({ pathname: "/student/[id]", params: { id: folder.studentId as string } })}
              accessibilityLabel={`${folder.name}’s page: classes and scores`}
              testID="drive-student-page"
            >
              Student’s page and scores
            </Button>
          ) : null}
        </Card>

        {actions.adding ? <Adding count={actions.adding} /> : null}

        {items.length ? (
          <>
            <DriveSection title="Folders" detail={String(folders.length)} items={folders} index={index} actions={actions} testID="drive-folder-folders" />
            <DriveSection
              title="Files"
              detail={String(files.length)}
              items={files}
              index={index}
              actions={actions}
              scores={studentId ? scoresByFile : undefined}
              limit={FILES_SHOWN}
              testID="drive-folder-files"
            />
            <T variant="small" tone="muted" style={styles.note}>
              {studentId && scoresByFile.size ? "Tap a result’s score to open it. " : ""}SIUS PDFs and other files are added on the website.
            </T>
          </>
        ) : (
          <EmptyState
            testID="drive-folder-empty"
            icon={<FolderOpen size={26} color={colors.mutedForeground} />}
            title="This folder is empty"
            text="Add photos from this phone, or make a folder inside it. SIUS PDFs and other files are added on the website."
            action={<AddButtons onPhotos={() => void actions.addPhotos(folder.id)} onFolder={() => actions.newFolder(folder.id)} />}
          />
        )}
      </Screen>
      {actions.dialogs}
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  headTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  note: { paddingHorizontal: space.xs },
});
