import { ChevronRight, FolderPlus, ImagePlus } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/** Small pieces of the Drive's screens. */

/** Photos being made ready for the Drive (a HEIC one is saved as a JPEG first). */
export function Adding({ count }: { count: number }) {
  const colors = useColors();
  return (
    <View style={[styles.adding, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityLiveRegion="polite" testID="drive-adding">
      <ActivityIndicator color={colors.mutedForeground} />
      <T variant="small" tone="muted">
        Getting {count === 1 ? "the photo" : `${count} photos`} ready…
      </T>
    </View>
  );
}

/** Add photos or make a folder: an empty place's two ways to start. */
export function AddButtons({ onPhotos, onFolder }: { onPhotos: () => void; onFolder: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.buttons}>
      <Button icon={<ImagePlus size={18} color={colors.primaryForeground} />} onPress={onPhotos} testID="drive-empty-photos">
        Add photos
      </Button>
      <Button variant="outline" icon={<FolderPlus size={18} color={colors.foreground} />} onPress={onFolder} testID="drive-empty-folder">
        New folder
      </Button>
    </View>
  );
}

/** Where a folder is: "Drive › Mia Larkin › Matches", each part a tap away. */
export function Crumbs({ path, onOpen }: { path: { id: string; name: string }[]; onOpen: (id: string | null) => void }) {
  const colors = useColors();
  const part = (id: string | null, name: string) => (
    <Pressable
      key={id ?? "top"}
      accessibilityRole="link"
      accessibilityLabel={id ? `Open ${name}` : "Open the top of the Drive"}
      onPress={() => onOpen(id)}
      hitSlop={6}
      style={({ pressed }) => [styles.crumb, pressed && { backgroundColor: colors.accent }]}
      testID={id ? `drive-crumb-${id}` : "drive-crumb-top"}
    >
      <T variant="small" tone="muted" numberOfLines={1} style={styles.crumbText}>
        {name}
      </T>
    </Pressable>
  );
  return (
    <View style={styles.crumbs} testID="drive-crumbs">
      {part(null, "Drive")}
      {path.map((c) => (
        <View key={c.id} style={styles.crumbPart}>
          <ChevronRight size={13} color={colors.mutedForeground} />
          {part(c.id, c.name)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  adding: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, paddingVertical: space.md },
  buttons: { gap: space.sm, alignSelf: "stretch" },
  crumbs: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 2, marginLeft: -6 },
  crumbPart: { flexDirection: "row", alignItems: "center", maxWidth: "100%" },
  crumb: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3, maxWidth: 220 },
  crumbText: { fontWeight: "500" },
});
