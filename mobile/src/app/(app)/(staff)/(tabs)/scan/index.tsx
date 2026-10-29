import { collection, limit, orderBy, query } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { POSITION_LABELS, type Evaluation } from "@shared/shooting/evaluation";
import { formatDateKey } from "@shared/time";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Camera, ChevronDown, ChevronUp, Images, Lightbulb, Trophy } from "lucide-react-native";
import { useMemo, useState } from "react";
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
 * The Scan tab, kept short (the owner, 2026-10-28): a paper card's photo, from the camera or the library (several at
 * once are read one after the other), scored and filed in the student's Drive; a competition's results from a photo of
 * its results sheet (/scan/sheet); the latest paper cards saved, from the app or the website; and, folded at the
 * bottom, the tips for a good scan.
 */
export default function ScanScreen() {
  const colors = useColors();
  const { branchId } = useBranch();
  const recent = useQuery<Evaluation>(`recent-evaluations-${branchId}`, () =>
    query(collection(db, ROOT.branches, branchId, COL.evaluations), orderBy("createdAt", "desc"), limit(30)),
  );
  const cards = useMemo(() => recent.data.filter((e) => e.source === "paper").slice(0, 8), [recent.data]);
  const [tips, setTips] = useState(false);

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
        <T tone="muted">Photograph the card: the app scores every shot, you check it and choose the student.</T>
        <View style={styles.buttons}>
          <Button size="lg" icon={<Camera size={20} color={colors.primaryForeground} />} onPress={() => router.push("/scan/camera")} testID="scan-take-photo">
            Take a photo
          </Button>
          <Button size="lg" variant="outline" icon={<Images size={20} color={colors.foreground} />} onPress={() => void choose()} testID="scan-choose-photos">
            Choose from Photos
          </Button>
        </View>
      </Card>
      <ListSection>
        <ListRow
          icon={<Trophy size={20} color={colors.foreground} />}
          title="Add a competition result"
          subtitle="From a photo of the results sheet"
          onPress={() => router.push("/scan/sheet")}
          testID="scan-competition"
        />
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
      <ListSection>
        <ListRow
          icon={<Lightbulb size={20} color={colors.mutedForeground} />}
          title="Tips for a good scan"
          right={tips ? <ChevronUp size={18} color={colors.mutedForeground} /> : <ChevronDown size={18} color={colors.mutedForeground} />}
          chevron={false}
          onPress={() => setTips((t) => !t)}
          accessibilityLabel={tips ? "Hide the tips for a good scan" : "Show the tips for a good scan"}
          testID="scan-tips"
        />
        {tips
          ? [
              <ListRow key="whole" title="The whole card, from straight above" subtitle="Fill the photo with it." />,
              <ListRow key="flat" title="Flat, in even light" subtitle="No glare on the black, no shadow across it." />,
              <ListRow key="alone" title="On its own" subtitle="Not on the pile of cards, and nothing over the bulls." />,
              <ListRow key="several" title="Several cards?" subtitle="Choose them all from Photos: they’re read one after the other." />,
            ]
          : null}
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.md },
  buttons: { gap: space.sm, marginTop: space.xs },
  empty: { paddingHorizontal: space.xs },
});
