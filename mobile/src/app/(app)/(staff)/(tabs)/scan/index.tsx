import { collection, limit, orderBy, query } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { POSITION_LABELS, type Evaluation } from "@shared/shooting/evaluation";
import { formatDateKey } from "@shared/time";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Camera, Images, Trophy } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * The Scan tab: a paper card's photo, from the camera or the library (several at once are read one after the other),
 * scored and filed in the student's Drive; a competition's results from a photo of its results sheet (/scan/sheet).
 * Below, the latest paper cards saved, from the app or the website.
 */
export default function ScanScreen() {
  const colors = useColors();
  const { branchId } = useBranch();
  const recent = useQuery<Evaluation>(`recent-evaluations-${branchId}`, () =>
    query(collection(db, ROOT.branches, branchId, COL.evaluations), orderBy("createdAt", "desc"), limit(30)),
  );
  const cards = useMemo(() => recent.data.filter((e) => e.source === "paper").slice(0, 8), [recent.data]);

  const choose = async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 20,
        orderedSelection: true,
        quality: 1,
        exif: false,
      });
      if (picked.canceled || !picked.assets.length) return;
      router.push({ pathname: "/scan/review", params: { photos: JSON.stringify(picked.assets.map((a) => a.uri)), from: "library" } });
    } catch (e) {
      toast.error("Couldn’t open Photos", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Screen title="Scan" testID="scan-screen">
      <Card style={styles.hero}>
        <T variant="heading">Score a paper target</T>
        <T tone="muted">
          Photograph the card: the app finds every shot and scores it. You check it, choose the student, and it’s saved in their Drive with the scores for their
          reports.
        </T>
        <View style={styles.buttons}>
          <Button size="lg" icon={<Camera size={20} color={colors.primaryForeground} />} onPress={() => router.push("/scan/camera")} testID="scan-take-photo">
            Take a photo
          </Button>
          <Button size="lg" variant="outline" icon={<Images size={20} color={colors.foreground} />} onPress={() => void choose()} testID="scan-choose-photos">
            Choose from Photos
          </Button>
        </View>
      </Card>
      <ListSection title="After a match">
        <ListRow
          icon={<Trophy size={20} color={colors.foreground} />}
          title="Add a competition result"
          subtitle="Photograph the results sheet: its numbers fill the form, and it’s filed in the student’s Drive."
          onPress={() => router.push("/scan/sheet")}
          testID="scan-competition"
        />
      </ListSection>
      <ListSection title="For a good scan">
        <ListRow title="The whole card in the photo" subtitle="Fill the frame with it, from straight above." />
        <ListRow
          title="On something light, on its own"
          subtitle={
            <T variant="small" tone="muted">
              A white table or sheet, not the pile of cards: holes in the black show only where light comes through. Nothing over the bulls.
            </T>
          }
        />
        <ListRow title="Flat, in even light" subtitle="No glare on the black, no shadow across it." />
        <ListRow title="Several cards?" subtitle="Choose them all from Photos: they’re read one after the other." />
      </ListSection>
      {cards.length ? (
        <ListSection title="Latest paper cards">
          {cards.map((e) => (
            <ListRow
              key={e.id}
              title={e.studentName}
              subtitle={`${formatDateKey(e.dateKey, "medium")} · ${POSITION_LABELS[e.position]}`}
              right={`${e.total}/${e.shots * 10}`}
              onPress={() => router.push(`/student/${e.studentId}`)}
              testID={`scan-recent-${e.id}`}
            />
          ))}
        </ListSection>
      ) : (
        <T variant="small" tone="muted" style={styles.empty}>
          {recent.loading ? "Loading the latest cards…" : "The paper cards you save show up here."}
        </T>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.md },
  buttons: { gap: space.sm, marginTop: space.xs },
  empty: { paddingHorizontal: space.xs },
});
