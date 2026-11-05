import { doc, serverTimestamp, setDoc } from "@react-native-firebase/firestore";
import { type NoticeKey, type NoticePrefs, noticeOn, noticeSwitchesFor } from "@shared/notices";
import { COL, ROOT } from "@shared/paths";
import { useState } from "react";
import { ListSection } from "@/components/List";
import { SwitchRow } from "@/components/SwitchRow";
import { db } from "@/lib/firebase";
import { useDoc } from "@/lib/firestore";
import { useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";

/**
 * A parent's, a student's or the office's notification switches (`noticeSwitchesFor(role)`, shared/src/notices.ts), as
 * the website's (web/src/features/notifications/NoticeSwitches.tsx): each kind of notice on or off, for the inbox and
 * the phone alike. Saved to `notificationPrefs/{email}` as soon as it's flipped, with only the fields the rules allow;
 * the switch shows its new position at once (and keeps it while the phone is offline). A switch never set is on.
 * Coaches keep their four on their staff record.
 */
/** A family's switches in Korean (docs/DECISIONS.md §36); the office's stay English, as its screens do. */
const NOTICE_KO: Partial<Record<NoticeKey, { label: string; help: string }>> = {
  classChanges: { label: "수업 변경", help: "수업이 취소되거나 옮겨지거나 빠졌을 때, 결석했을 때" },
  requests: { label: "신청 결과", help: "신청한 수업을 아카데미가 승인하거나 거절할 때, 다른 시간을 제안할 때" },
  scores: { label: "새 점수", help: "새 점수가 저장됐을 때" },
  reports: { label: "성장 리포트", help: "아카데미가 성장 리포트를 보낼 때" },
  announcements: { label: "아카데미 소식", help: "아카데미가 가족에게 올린 소식" },
};

export function NoticeSwitches() {
  const { branchId, role, actor } = useBranch();
  const t = useT();
  const path = `${ROOT.branches}/${branchId}/${COL.notificationPrefs}/${actor.email}`;
  const prefs = useDoc<NoticePrefs>(path);
  const [pending, setPending] = useState<Partial<Record<NoticeKey, boolean>>>({});
  const switches = noticeSwitchesFor(role);
  if (!switches.length) return null;

  const flip = (key: NoticeKey, on: boolean) => {
    setPending((p) => ({ ...p, [key]: on }));
    setDoc(doc(db, path), { [key]: on, updatedAt: serverTimestamp() }, { merge: true })
      .catch(() => toast.error(t("Not saved", "저장하지 못했어요"), { description: t("Please try again.", "다시 시도해 주세요.") }))
      .finally(() =>
        setPending((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        }),
      );
  };

  return (
    <ListSection
      title={t("What you’re told about", "받을 소식")}
      footer={t("Turning one off stops it in your notifications and on your phones, wherever you’re signed in.", "끄면 로그인한 모든 기기와 알림함에서 그 소식을 받지 않아요.")}
      testID="notice-switches"
    >
      {switches.map((s) => (
        <SwitchRow
          key={s.key}
          title={t(s.label, NOTICE_KO[s.key]?.label ?? s.label)}
          subtitle={t(s.help, NOTICE_KO[s.key]?.help ?? s.help)}
          value={pending[s.key] ?? noticeOn(prefs.data, s.key)}
          disabled={prefs.loading}
          onValueChange={(on) => flip(s.key, on)}
          testID={`notice-${s.key}`}
        />
      ))}
    </ListSection>
  );
}
