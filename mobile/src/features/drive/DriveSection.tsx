import type { DriveIndex, DriveItem } from "@shared/drive/model";
import type { Evaluation } from "@shared/shooting/evaluation";
import { router } from "expo-router";
import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { ListRow, ListSection } from "@/components/List";
import { useColors } from "@/theme";
import { DriveRow } from "./DriveRow";
import type { useDriveActions } from "./useDriveActions";

type Actions = ReturnType<typeof useDriveActions>;

/**
 * A group of the Drive's rows under a small title (Students, Folders, Files, search results), each opening on a tap and
 * offering what can be done with it from "…" or a long press. A long list shows its first `limit` rows and a row to show
 * the rest. `scores`: a student's results by file, shown on their rows (a tap on the score opens it).
 */
export function DriveSection({
  title,
  detail,
  items,
  index,
  actions,
  scores,
  where,
  limit = 0,
  testID,
}: {
  title?: string;
  detail?: string;
  items: DriveItem[];
  index: DriveIndex;
  actions: Actions;
  scores?: Map<string, Evaluation & { id: string }>;
  /** Search results: where each one is. */
  where?: (it: DriveItem) => string;
  limit?: number;
  testID?: string;
}) {
  const colors = useColors();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = limit && !all ? items.slice(0, limit) : items;
  return (
    <ListSection title={title} detail={detail} testID={testID}>
      {shown.map((it) => {
        const score = it.kind === "file" ? (scores?.get(it.id) ?? null) : null;
        const uploading = it.kind === "file" && it.file.status === "uploading";
        return (
          <DriveRow
            key={it.id}
            item={it}
            index={index}
            where={where ? where(it) : null}
            score={score}
            onScore={score ? () => router.push({ pathname: "/score/[id]", params: { id: score.id } }) : undefined}
            upload={uploading ? { progress: actions.uploads.progress(it.id), waiting: actions.uploads.waiting(it.id) } : null}
            onPress={() => actions.open(it)}
            onMore={() => actions.menu(it, score?.id ?? null)}
            testID={`drive-row-${it.id}`}
          />
        );
      })}
      {shown.length < items.length ? (
        <ListRow
          icon={<ChevronDown size={18} color={colors.mutedForeground} />}
          title={`Show all ${items.length}`}
          chevron={false}
          onPress={() => setAll(true)}
          testID={testID ? `${testID}-all` : undefined}
        />
      ) : null}
    </ListSection>
  );
}
