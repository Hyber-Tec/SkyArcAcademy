import { Stack, router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { Image } from "expo-image";
import { FileQuestion, Share, X } from "lucide-react-native";
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import WebView from "react-native-webview";
import { categoryOf } from "@shared/drive/files";
import { formatBytes } from "@shared/drive/model";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { Spinner } from "@/components/Loading";
import { T } from "@/components/Text";
import { useDriveFile } from "@/features/data/hooks";
import { useLocalCopy } from "@/features/drive/download";
import { toast } from "@/lib/toast";
import { space, useColors } from "@/theme";

/**
 * A Drive file, full screen (loaded by ID): a picture to zoom into, or a PDF (and the other documents an iPhone can
 * show) in a viewer; on Android a PDF opens in another app through Share. Downloaded through the Storage rules into the
 * app's cache, never through a public link.
 */
export default function FileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const file = useDriveFile(id ?? null);
  const f = file.data;
  const copy = useLocalCopy(f && f.status === "ready" ? { id: f.id, kind: f.kind, size: f.size } : null);
  const kind = f ? categoryOf(f.kind) : "other";
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const share = async () => {
    if (!copy.uri || !f) return;
    try {
      if (!(await Sharing.isAvailableAsync())) return void toast.error("Sharing isn’t available on this phone");
      await Sharing.shareAsync(copy.uri, { mimeType: f.mime, dialogTitle: f.name });
    } catch {
      toast.error("Couldn’t share the file");
    }
  };

  const header = (
    <Stack.Screen
      options={{
        title: f?.name ?? "",
        headerLeft: () => <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} size={36} testID="file-close" />,
        headerRight: () => (copy.uri ? <IconButton icon={<Share size={20} color={colors.foreground} />} accessibilityLabel="Share" onPress={() => void share()} size={36} testID="file-share" /> : null),
      }}
    />
  );

  if (file.loading || (f && f.status === "ready" && copy.loading)) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} testID="file-screen">
        {header}
        <Spinner label={f ? `Opening ${f.name}…` : "Opening…"} />
      </View>
    );
  }
  if (!f || f.trashed || f.status !== "ready" || copy.error) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]} testID="file-screen">
        {header}
        <EmptyState
          icon={<FileQuestion size={26} color={colors.mutedForeground} />}
          title={!f || f.trashed ? "This file isn’t in the Drive" : f.status !== "ready" ? "This file is still uploading" : "Couldn’t open this file"}
          text={!f || f.trashed ? "It may have been moved to the Trash on the website." : f.status !== "ready" ? "Try again in a moment." : "Check your connection and try again."}
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
          <Image source={{ uri: copy.uri }} style={{ width, height: height * 0.8 }} contentFit="contain" accessibilityLabel={f.name} />
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
          <T variant="heading">{f.name}</T>
          <T tone="muted">{formatBytes(f.size)}. Open it in another app on this phone.</T>
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
