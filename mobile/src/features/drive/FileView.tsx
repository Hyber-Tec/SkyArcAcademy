import { Stack, router } from "expo-router";
import * as Sharing from "expo-sharing";
import { Image } from "expo-image";
import { FileQuestion, Share, X } from "lucide-react-native";
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import WebView from "react-native-webview";
import { type FileCategory, categoryOf } from "@shared/drive/files";
import { formatBytes } from "@shared/drive/model";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { Spinner } from "@/components/Loading";
import { T } from "@/components/Text";
import { type DriveFileDoc, useDriveFile } from "@/features/data/hooks";
import { toast } from "@/lib/toast";
import { space, useColors } from "@/theme";
import { useLocalCopy } from "./download";

/**
 * A Drive file, full screen (loaded by ID): a picture to zoom into, or a PDF (and the other documents an iPhone can
 * show) in a viewer; on Android a PDF opens in another app through Share. Downloaded through the Storage rules into the
 * app's cache, never through a public link. The staff open any file (src/app/(app)/(staff)/file/[id].tsx); a family
 * only a score's own file in their child's folder (src/app/(app)/(family)/file/[id].tsx), whose record they can't read
 * once it's in the Trash or no longer a score's: `gone` says so in their words.
 */
export function FileView({ id, gone, allow }: { id: string | null; gone: { title: string; text: string }; allow?: (f: DriveFileDoc) => boolean }) {
  const file = useDriveFile(id);
  // `allow`: what this person may open, past the rules (the phone's copy of what another account saw on it).
  const f = file.data && (!allow || allow(file.data)) ? file.data : null;
  const copy = useLocalCopy(f && f.status === "ready" && !f.trashed ? { id: f.id, kind: f.kind, size: f.size, name: f.name } : null);
  return (
    <FileViewer
      file={f ? { name: f.name, mime: f.mime, size: f.size, category: categoryOf(f.kind) } : null}
      loading={file.loading}
      unavailable={!f || f.trashed ? gone : f.status !== "ready" ? { title: "This file is still uploading", text: "Try again in a moment." } : null}
      copy={copy}
    />
  );
}

/** What the viewer shows a file as: its name, type and size, and which kind of file it is. */
export interface ViewerFile {
  name: string;
  mime: string;
  size: number;
  category: FileCategory;
}

/**
 * A file full screen, from its copy on this phone (useStorageCopy): a picture to zoom into, a PDF (and the other
 * documents an iPhone can show) in a viewer, or else the way to open it in another app; Share in the corner. While its
 * record or its copy loads it says it's opening; `unavailable` says why it can't be shown, and a copy that failed to
 * download offers to try again. A Drive file (FileView) and a news post's attachment open in it.
 */
export function FileViewer({
  file,
  loading,
  unavailable,
  copy,
}: {
  /** The file, once its record is in (null when there's none to show). */
  file: ViewerFile | null;
  /** Its record is loading. */
  loading: boolean;
  unavailable: { title: string; text: string } | null;
  copy: { uri: string | null; error: string | null; loading: boolean; retry: () => void };
}) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const kind = file?.category ?? "other";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const share = async () => {
    if (!copy.uri || !file) return;
    try {
      if (!(await Sharing.isAvailableAsync())) return void toast.error("Sharing isn’t available on this phone");
      await Sharing.shareAsync(copy.uri, { mimeType: file.mime, dialogTitle: file.name });
    } catch {
      toast.error("Couldn’t share the file");
    }
  };

  const header = (
    <Stack.Screen
      options={{
        title: file?.name ?? "",
        headerLeft: () => <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} size={36} testID="file-close" />,
        headerRight: () => (copy.uri ? <IconButton icon={<Share size={20} color={colors.foreground} />} accessibilityLabel="Share" onPress={() => void share()} size={36} testID="file-share" /> : null),
      }}
    />
  );

  if (loading || (file && !unavailable && copy.loading)) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} testID="file-screen">
        {header}
        <Spinner label={file ? `Opening ${file.name}…` : "Opening…"} />
      </View>
    );
  }
  if (!file || unavailable || copy.error) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} testID="file-screen">
        {header}
        <EmptyState
          testID="file-unavailable"
          icon={<FileQuestion size={26} color={colors.mutedForeground} />}
          title={unavailable?.title ?? "Couldn’t open this file"}
          text={unavailable?.text ?? "Check your connection and try again."}
          action={
            copy.error ? (
              <Button variant="outline" onPress={copy.retry} testID="file-retry">
                Try again
              </Button>
            ) : undefined
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: kind === "image" ? "#000000" : colors.background }]} testID="file-screen">
      {header}
      {kind === "image" && copy.uri ? (
        <ScrollView style={styles.fill} contentContainerStyle={styles.center} maximumZoomScale={5} minimumZoomScale={1} centerContent bouncesZoom>
          <Image source={{ uri: copy.uri }} style={{ width, height: height * 0.8 }} contentFit="contain" accessibilityLabel={file.name} testID="file-image" />
        </ScrollView>
      ) : Platform.OS === "ios" && copy.uri ? (
        // The web view may read this one file only (a folder there leaves an iPhone's page blank).
        <WebView
          source={{ uri: copy.uri }}
          originWhitelist={["*"]}
          allowFileAccess
          allowingReadAccessToURL={copy.uri}
          style={styles.fill}
          testID="file-viewer"
        />
      ) : (
        <View style={styles.other}>
          <T variant="heading">{file.name}</T>
          <T tone="muted">{formatBytes(file.size)}. Open it in another app on this phone.</T>
          <Button onPress={() => void share()} icon={<Share size={18} color={colors.primaryForeground} />} testID="file-open-with">
            Open with…
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  other: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
});
