import { formatPhone } from "@shared/people";
import { Globe, Link2Off, Mail, MapPin, Phone } from "lucide-react-native";
import { ContactButtons } from "@/components/ContactButtons";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { ListRow, ListSection, RowIcon } from "@/components/List";
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
export function AcademyContact({ title = "Contact the academy", footer, reachOnly = false }: { title?: string; footer?: string; reachOnly?: boolean }) {
  const contact = useAcademyContact();
  const { name } = useBranch();
  const colors = useColors();
  const phone = contact?.phone?.trim();
  const email = contact?.email?.trim();
  // `reachOnly`: the phone and the email (asking for a change), without the address and website.
  const address = reachOnly ? null : contact?.address?.trim();
  const website = reachOnly ? null : contact?.website?.trim();
  if (!phone && !email && !address && !website) return null;
  return (
    <ListSection title={title} footer={footer} testID="family-contact">
      {phone ? (
        <ListRow
          icon={
            <RowIcon>
              <Phone size={17} color={colors.foreground} />
            </RowIcon>
          }
          title={formatPhone(phone)}
          subtitle="Call or text"
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
          subtitle="Email"
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
          subtitle="Open in Maps"
          onPress={() => void openMap(address)}
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
          subtitle="Website"
          onPress={() => void openUrl(webLink(website))}
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
  return (
    <EmptyState
      testID={testID ?? "family-not-linked"}
      icon={<Link2Off size={26} color={colors.mutedForeground} />}
      title={who === "parent" ? "No children linked yet" : "Your account isn’t linked yet"}
      text={
        who === "parent"
          ? `Ask ${name} to link your child to your account. Their classes and reports show here once it does.`
          : `Ask ${name} to link your account to your student record. Your classes and reports show here once it does.`
      }
    />
  );
}
