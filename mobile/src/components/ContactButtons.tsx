import { Mail, MessageSquare, Phone } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { IconButton } from "@/components/IconButton";
import { useLang, useT } from "@/lib/lang";
import { contact } from "@/lib/links";
import { space, useColors } from "@/theme";

/** A person's phone and email as round buttons: call, text, email (only those they have). */
export function ContactButtons({ phone, email, name, testID }: { phone?: string | null; email?: string | null; name: string; testID?: string }) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  return (
    <View style={styles.actions} testID={testID}>
      {phone ? <IconButton icon={<Phone size={18} color={colors.foreground} />} accessibilityLabel={t(`Call ${name}`, `${name} 전화하기`)} onPress={() => void contact("call", phone, lang)} size={36} filled /> : null}
      {phone ? <IconButton icon={<MessageSquare size={18} color={colors.foreground} />} accessibilityLabel={t(`Text ${name}`, `${name} 문자 보내기`)} onPress={() => void contact("text", phone, lang)} size={36} filled /> : null}
      {email ? <IconButton icon={<Mail size={18} color={colors.foreground} />} accessibilityLabel={t(`Email ${name}`, `${name} 이메일 보내기`)} onPress={() => void contact("email", email, lang)} size={36} filled /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.xs },
});
