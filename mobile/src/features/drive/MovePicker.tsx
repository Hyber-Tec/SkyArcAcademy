import { type DriveIndex, moveRefusal } from "@shared/drive/model";
import { isContractsFolder } from "@shared/drive/types";
import { ChevronRight, HardDrive } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";
import { FolderGlyph } from "./DriveIcons";

/**
 * "Move to…", as the website's (web/src/features/drive/MoveDialog.tsx): walk the Drive's folders from where you are and
 * move what was chosen into the folder you're in. It says why when it can't go there (inside itself, a student's
 * folder anywhere but the top, where it already is).
 */
export function MovePicker({
  index,
  folderIds,
  fileIds,
  startAt,
  onMove,
  onClose,
}: {
  index: DriveIndex;
  folderIds: string[];
  fileIds: string[];
  startAt: string | null;
  onMove: (targetId: string | null) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [at, setAt] = useState<string | null>(startAt && index.folderOf(startAt) ? startAt : null);
  const moving = new Set(folderIds);
  const count = folderIds.length + fileIds.length;
  const name = count === 1 ? (index.folderOf(folderIds[0])?.name ?? index.fileOf(fileIds[0])?.name ?? "it") : `${count} items`;
  const crumbs = index.pathOf(at);
  const refusal = moveRefusal(index, folderIds, fileIds, at);
  // Only signed contracts go in a Contracts folder (they land there by themselves).
  const folders = index.foldersIn(at).filter((f) => !moving.has(f.id) && !isContractsFolder(f.id));
  const here = at ? (index.folderOf(at)?.name ?? "this folder") : "the top of the Drive";
  const crumb = (id: string | null, label: string, last: boolean) => (
    <Pressable
      key={id ?? "top"}
      accessibilityRole="button"
      accessibilityLabel={id ? `Back to ${label}` : "Back to the top of the Drive"}
      accessibilityState={{ selected: last }}
      onPress={() => setAt(id)}
      hitSlop={6}
      style={({ pressed }) => [styles.crumb, pressed && { backgroundColor: colors.accent }]}
      testID={id ? `drive-move-crumb-${id}` : "drive-move-crumb-top"}
    >
      <T variant="small" numberOfLines={1} style={[styles.crumbText, last && styles.current]} tone={last ? "default" : "muted"}>
        {label}
      </T>
    </Pressable>
  );
  return (
    <Dialog
      open
      onRequestClose={onClose}
      testID="drive-move"
      footer={
        <>
          {refusal ? (
            <T variant="small" tone="muted" style={styles.center} testID="drive-move-refusal">
              {refusal}
            </T>
          ) : null}
          <View style={styles.buttons}>
            <Button variant="outline" onPress={onClose} style={styles.grow} testID="drive-move-cancel">
              Cancel
            </Button>
            <Button
              onPress={() => {
                onMove(at);
                onClose();
              }}
              disabled={!!refusal}
              style={styles.grow}
              accessibilityLabel={`Move here, to ${here}`}
              testID="drive-move-here"
            >
              Move here
            </Button>
          </View>
        </>
      }
    >
      <View style={styles.head}>
        <T variant="heading" numberOfLines={2}>
          Move {count === 1 ? `“${name}”` : name}
        </T>
        <T variant="small" tone="muted">
          Open the folder it should go in, then choose Move here.
        </T>
      </View>
      <View style={styles.crumbs} accessibilityLabel="Where">
        {crumb(null, "Drive", !at)}
        {crumbs.map((c, i) => (
          <View key={c.id} style={styles.crumbPart}>
            <ChevronRight size={14} color={colors.mutedForeground} />
            {crumb(c.id, c.name, i === crumbs.length - 1)}
          </View>
        ))}
      </View>
      <View style={[styles.list, { borderColor: colors.border }]}>
        {folders.length ? (
          folders.map((f, i) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${f.name}`}
              onPress={() => setAt(f.id)}
              style={({ pressed }) => [styles.folder, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
              testID={`drive-move-folder-${f.id}`}
            >
              <FolderGlyph student={!!f.studentId} size={26} />
              <T numberOfLines={2} style={styles.grow}>
                {f.name}
              </T>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Pressable>
          ))
        ) : (
          <View style={styles.none}>
            <HardDrive size={20} color={colors.mutedForeground} />
            <T variant="small" tone="muted">
              No folders in here.
            </T>
          </View>
        )}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.xs },
  crumbs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: space.xs },
  crumbPart: { flexDirection: "row", alignItems: "center", maxWidth: "100%" },
  crumb: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 4, maxWidth: 220 },
  crumbText: { fontWeight: "500" },
  current: { fontWeight: "700" },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: "hidden" },
  folder: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 50 },
  none: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },
  buttons: { flexDirection: "row", gap: space.md },
  grow: { flex: 1 },
  center: { textAlign: "center" },
});
