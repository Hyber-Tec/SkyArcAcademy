import { formatPhone } from "@shared/people";
import { Globe, Link2Off, Mail, MapPin, Phone } from "lucide-react-native";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { useLang, useT } from "@/lib/lang";
import { openMap, openUrl, webLink } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { useColors } from "@/theme";
import { useAcademyContact } from "./data";
import { useChildChoices, useFamily } from "./FamilyProvider";

/** A parent's children as pills (All, then each child): which child the tabs show. Nothing for one child or a student. */
export function ChildSwitcher() {
  const { several, child, setChild } = useFamily();
  const choices = useChildChoices();
  if (!several) return null;
  return <FilterChips value={child} onChange={setChild} options={choices} testID="family-child-filter" />;
}

/**
 * How to reach the academy (Settings → Academy on the website): its phone a call or a text away, its email, address
 * (opens the map) and website. Nothing when the academy hasn't given any, as on the website.
 */
export function AcademyContact({ title, footer, reachOnly = false }: { title?: string; footer?: string; reachOnly?: boolean }) {
  const contact = useAcademyContact();
  const { name } = useBranch();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const phone = contact?.phone?.trim();
  const email = contact?.email?.trim();
  // `reachOnly`: the phone and the email (asking for a change), without the address and website.
  const address = reachOnly ? null : contact?.address?.trim();
  const website = reachOnly ? null : contact?.website?.trim();
  if (!phone && !email && !address && !website) return null;
  return (
    <ListSection title={title ?? t("Contact the academy", "아카데미 연락처")} footer={footer} testID="family-contact">
      {phone ? (
        <ListRow
          icon={
            <RowIcon>
              <Phone size={17} color={colors.foreground} />
            </RowIcon>
          }
          title={formatPhone(phone)}
          subtitle={t("Call or text", "전화 또는 문자")}
          right={<ContactButtons phone={phone} name={name} />}
          testID="family-contact-phone"
        />
      ) : null}
      {email ? (
        <ListRow
          icon={
            <RowIcon>
              <Mail size={17} color={colors.foreground} />
            </RowIcon>
          }
          title={email}
          subtitle={t("Email", "이메일")}
          right={<ContactButtons email={email} name={name} />}
          testID="family-contact-email"
        />
      ) : null}
      {address ? (
        <ListRow
          icon={
            <RowIcon>
              <MapPin size={17} color={colors.foreground} />
            </RowIcon>
          }
          title={address}
          subtitle={t("Open in Maps", "지도에서 열기")}
          onPress={() => void openMap(address, lang)}
          testID="family-contact-address"
        />
      ) : null}
      {website ? (
        <ListRow
          icon={
            <RowIcon>
              <Globe size={17} color={colors.foreground} />
            </RowIcon>
          }
          title={website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
          subtitle={t("Website", "웹사이트")}
          onPress={() => void openUrl(webLink(website), lang)}
          testID="family-contact-website"
        />
      ) : null}
    </ListSection>
  );
}

/** No student linked to this account yet: who to ask. */
export function NotLinked({ testID }: { testID?: string }) {
  const { who } = useFamily();
  const { name } = useBranch();
  const colors = useColors();
  const t = useT();
  return (
    <EmptyState
      testID={testID ?? "family-not-linked"}
      icon={<Link2Off size={26} color={colors.mutedForeground} />}
      title={who === "parent" ? t("No children linked yet", "아직 연결된 자녀가 없어요") : t("Your account isn’t linked yet", "아직 계정이 연결되지 않았어요")}
      text={
        who === "parent"
          ? t(
              `Ask ${name} to link your child to your account. Their classes and reports show here once it does.`,
              `${name}에 자녀 연결을 요청해 주세요. 연결되면 자녀의 수업과 리포트가 여기에 보여요.`,
            )
          : t(
              `Ask ${name} to link your account to your student record. Your classes and reports show here once it does.`,
              `${name}에 계정 연결을 요청해 주세요. 연결되면 수업과 리포트가 여기에 보여요.`,
            )
      }
    />
  );
}
