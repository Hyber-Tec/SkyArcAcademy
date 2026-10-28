import { doc, serverTimestamp, setDoc } from "@react-native-firebase/firestore";
import { type NoticeKey, type NoticePrefs, noticeOn, noticeSwitchesFor } from "@shared/notices";
import { COL, ROOT } from "@shared/paths";
import { useState } from "react";
import { ListSection } from "@/components/List";
import { SwitchRow } from "@/components/SwitchRow";
import { db } from "@/lib/firebase";
import { useDoc } from "@/lib/firestore";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";

/**
 * A parent's, a student's or the office's notification switches (`noticeSwitchesFor(role)`, shared/src/notices.ts), as
 * the website's (web/src/features/notifications/NoticeSwitches.tsx): each kind of notice on or off, for the inbox and
 * the phone alike. Saved to `notificationPrefs/{email}` as soon as it's flipped, with only the fields the rules allow;
 * the switch shows its new position at once (and keeps it while the phone is offline). A switch never set is on.
 * Coaches keep their four on their staff record.
 */
export function NoticeSwitches() {
  const { branchId, role, actor } = useBranch();
  const path = `${ROOT.branches}/${branchId}/${COL.notificationPrefs}/${actor.email}`;
  const prefs = useDoc<NoticePrefs>(path);
  const [pending, setPending] = useState<Partial<Record<NoticeKey, boolean>>>({});
  const switches = noticeSwitchesFor(role);
  if (!switches.length) return null;

  const flip = (key: NoticeKey, on: boolean) => {
    setPending((p) => ({ ...p, [key]: on }));
    setDoc(doc(db, path), { [key]: on, updatedAt: serverTimestamp() }, { merge: true })
      .catch(() => toast.error("Not saved", { description: "Please try again." }))
      .finally(() =>
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        }),
      );
  };

  return (
    <ListSection title="What you’re told about" footer="Turning one off stops it in your notifications and on your phones, wherever you’re signed in." testID="notice-switches">
      {switches.map((s) => (
        <SwitchRow
          key={s.key}
          title={s.label}
          subtitle={s.help}
          value={pending[s.key] ?? noticeOn(prefs.data, s.key)}
          disabled={prefs.loading}
          onValueChange={(on) => flip(s.key, on)}
          testID={`notice-${s.key}`}
        />
      ))}
    </ListSection>
  );
}
