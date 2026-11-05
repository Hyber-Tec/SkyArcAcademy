import type { ContractPdf } from "@shared/contracts/types";
import type { Lang } from "@shared/i18n";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ActivityIndicator, Modal, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { Button } from "@/components/Button";
import { SHEET_EDGES } from "@/components/Sheet";
import { T } from "@/components/Text";
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { space, useColors } from "@/theme";

/** A contract's PDF a function sent (a signed copy, a sample), saved in the app's cache to open or share. */
export function cachePdf(pdf: ContractPdf): { uri: string; name: string } {
  const dir = new Directory(Paths.cache, "contracts");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const base = pdf.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "Enrollment contract";
  const name = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  const file = new File(dir, name);
  if (file.exists) file.delete();
  const bin = atob(pdf.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  file.write(bytes);
  return { uri: file.uri, name };
}

/** The phone's share sheet for a PDF: Save to Files, Mail, Messages, a printer… */
export async function sharePdf(uri: string, name: string, lang: Lang = "en") {
  const ko = lang === "ko";
  try {
    if (!(await Sharing.isAvailableAsync())) return void toast.error(ko ? "이 기기에서는 공유할 수 없어요" : "Sharing isn’t available on this phone");
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: name });
  } catch {
    toast.error(ko ? "PDF를 공유하지 못했어요" : "Couldn’t share the PDF");
  }
}

/**
 * A PDF to read, with Save (the share sheet: Save to Files, Mail…) and Done, filling the sheet it's in. Android's web
 * view doesn't show PDFs, so there it goes straight to the share sheet (`openPdf`).
 */
export function PdfView({ pdf, onClose }: { pdf: { uri: string; name: string }; onClose: () => void }) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={SHEET_EDGES}>
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <T variant="label" numberOfLines={1} style={styles.fill}>
          {pdf.name}
        </T>
        <Button variant="ghost" onPress={() => void sharePdf(pdf.uri, pdf.name, lang)} testID="contract-pdf-share">
          {t("Save", "저장")}
        </Button>
        <Button variant="ghost" onPress={onClose} testID="contract-pdf-done">
          {t("Done", "닫기")}
        </Button>
      </View>
      {/* The web view may read this one file only (a folder there leaves an iPhone's page blank). */}
      <WebView
        source={{ uri: pdf.uri }}
        originWhitelist={["*"]}
        allowFileAccess
        allowingReadAccessToURL={pdf.uri}
        style={styles.fill}
        // A PDF takes a moment to draw: a spinner, not a blank sheet.
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.mutedForeground} />}
        testID="contract-pdf"
      />
    </SafeAreaView>
  );
}

/** A PDF in its own sheet (`PdfView`). */
export function PdfSheet({ pdf, onClose }: { pdf: { uri: string; name: string } | null; onClose: () => void }) {
  return (
    <Modal visible={!!pdf} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {pdf ? <PdfView pdf={pdf} onClose={onClose} /> : null}
    </Modal>
  );
}

/** Opens a PDF: in the sheet on an iPhone, the share sheet on Android. */
export async function openPdf(pdf: ContractPdf, show: (p: { uri: string; name: string }) => void, lang: Lang = "en") {
  const file = cachePdf(pdf);
  if (Platform.OS === "ios") show(file);
  else await sharePdf(file.uri, file.name, lang);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
