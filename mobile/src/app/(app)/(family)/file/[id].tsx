import { useLocalSearchParams } from "expo-router";
import { FileView } from "@/features/drive/FileView";
import { useFamily } from "@/features/family/FamilyProvider";
import { useT } from "@/lib/lang";
import { useBranch } from "@/state/BranchProvider";

/**
 * A score's original file, full screen (loaded by ID): a SIUS result's PDF or a paper card's picture, as the staff see
 * it (src/features/drive/FileView.tsx). The rules give a family only a score's own file in their child's folder; one
 * that's been removed, or is no longer a score's, can't be read, and the screen says so.
 */
export default function FamilyFileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { name } = useBranch();
  const family = useFamily();
  const t = useT();
  return (
    <FileView
      id={id ?? null}
      gone={{ title: t("This file isn’t available", "이 파일을 볼 수 없어요"), text: t(`It may have been removed. Ask ${name} if you need it.`, "삭제됐을 수 있어요. 필요하면 아카데미에 문의해 주세요.") }}
      // A score's own file in the family's own student's folder, as the rules give it.
      allow={(f) => !!f.evaluationId && !!f.studentId && family.ids.includes(f.studentId)}
    />
  );
}
