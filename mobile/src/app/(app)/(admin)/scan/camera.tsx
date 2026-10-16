import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { Zap, ZapOff, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CARD_EDGES_MM } from "@shared/targets/card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { T } from "@/components/Text";
import { toast } from "@/lib/toast";

/** The card's shape (US Letter, upright), for the frame drawn over the camera. */
const CARD_RATIO = (CARD_EDGES_MM.right - CARD_EDGES_MM.left) / (CARD_EDGES_MM.bottom - CARD_EDGES_MM.top);

/**
 * The camera, for a paper card: a frame the card's shape to fill, the flash, and the shutter. A photo goes straight to
 * the review (scan/review), which reads it. Asks for the camera the first time; without it, says how to allow it.
 */
export default function ScanCameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const { width, height } = useWindowDimensions();
  // Measured, not a safe-area view: over the camera the controls must clear the status bar and the home indicator.
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/scan"));

  if (!permission) return <View style={styles.black} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permission} testID="scan-camera-permission">
        <EmptyState
          title="Sky Arc needs the camera"
          text="It takes the photo of the paper card that it scores. Nothing else is filmed or kept."
          action={
            permission.canAskAgain ? (
              <Button onPress={() => void requestPermission()} testID="scan-camera-allow">
                Allow the camera
              </Button>
            ) : (
              <Button onPress={() => void Linking.openSettings()} testID="scan-camera-settings">
                Open Settings
              </Button>
            )
          }
        />
        <Button variant="ghost" onPress={close}>
          Not now
        </Button>
      </SafeAreaView>
    );
  }

  const take = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.92, exif: false, shutterSound: false });
      if (!photo?.uri) throw new Error("No photo came back.");
      router.replace({ pathname: "/scan/review", params: { photos: JSON.stringify([photo.uri]), from: "camera" } });
    } catch (e) {
      toast.error("Couldn’t take the photo", { description: e instanceof Error ? e.message : String(e) });
      setBusy(false);
    }
  };

  // The frame: as wide as the screen allows, with room for the controls above and below.
  const frameWidth = Math.min(width - 48, (height - 260) * CARD_RATIO);
  const frameHeight = frameWidth / CARD_RATIO;
  return (
    <View style={styles.black} testID="scan-camera">
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} animateShutter onCameraReady={() => setReady(true)} />
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]} pointerEvents="box-none">
        <View style={styles.top}>
          <IconButton icon={<X size={24} color="#fff" />} accessibilityLabel="Close the camera" onPress={close} testID="scan-camera-close" />
          <IconButton
            icon={torch ? <Zap size={22} color="#facc15" /> : <ZapOff size={22} color="#fff" />}
            accessibilityLabel={torch ? "Turn the light off" : "Turn the light on"}
            onPress={() => setTorch((t) => !t)}
            testID="scan-camera-light"
          />
        </View>
        <View style={styles.middle} pointerEvents="none">
          <View style={[styles.frame, { width: frameWidth, height: frameHeight }]} />
          <T variant="label" style={styles.hint}>
            Fill the frame with the whole card, from straight above
          </T>
        </View>
        <View style={styles.bottom}>
          <Pressable
            testID="scan-shutter"
            accessibilityRole="button"
            accessibilityLabel="Take the photo"
            disabled={!ready || busy}
            onPress={() => void take()}
            style={({ pressed }) => [styles.shutter, { opacity: !ready || busy ? 0.5 : pressed ? 0.8 : 1 }]}
          >
            {busy ? <ActivityIndicator color="#0a0a0a" /> : <View style={styles.shutterInner} />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  permission: { flex: 1, justifyContent: "center", padding: 24 },
  overlay: { flex: 1, justifyContent: "space-between" },
  top: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 4 },
  middle: { alignItems: "center", gap: 14 },
  frame: { borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 12 },
  hint: { color: "#fff", textAlign: "center", paddingHorizontal: 24, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  bottom: { alignItems: "center", paddingBottom: 18 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
});
