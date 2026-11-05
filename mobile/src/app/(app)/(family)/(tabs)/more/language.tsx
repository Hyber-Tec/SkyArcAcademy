import { LANGS, LANG_NAMES, type Lang } from "@shared/i18n";
import { Check } from "lucide-react-native";
import { ListRow, ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { useLangChoice, useT } from "@/lib/lang";
import { useColors } from "@/theme";

/**
 * More → Language (docs/DECISIONS.md §36): English or 한국어, each in its own language, for this phone's screens and
 * its notifications. Until a parent chooses, the app follows the phone's language.
 */
export default function FamilyLanguageScreen() {
  const { lang, chosen, setLang } = useLangChoice();
  const t = useT();
  const colors = useColors();
  return (
    <Screen typing={false} testID="family-language">
      <ListSection
        footer={
          chosen
            ? t("Notifications on this phone come in the same language.", "이 기기로 오는 알림도 같은 언어로 와요.")
            : t("Until you choose, the app follows this phone’s language.", "따로 고르기 전까지는 이 기기의 언어를 따라가요.")
        }
      >
        {LANGS.map((l: Lang) => (
          <ListRow
            key={l}
            title={LANG_NAMES[l]}
            right={lang === l ? <Check size={18} color={colors.foreground} /> : undefined}
            chevron={false}
            onPress={() => setLang(l)}
            testID={`family-language-${l}`}
          />
        ))}
      </ListSection>
    </Screen>
  );
}
