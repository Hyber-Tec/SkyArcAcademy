import { Mail, MessageSquare, Phone } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { IconButton } from "@/components/IconButton";
import { contact } from "@/lib/links";
import { space, useColors } from "@/theme";

/** A person's phone and email as round buttons: call, text, email (only those they have). */
export function ContactButtons({ phone, email, name, testID }: { phone?: string | null; email?: string | null; name: string; testID?: string }) {
  const colors = useColors();
  return (
    <View style={styles.actions} testID={testID}>
      {phone ? <IconButton icon={<Phone size={18} color={colors.foreground} />} accessibilityLabel={`Call ${name}`} onPress={() => void contact("call", phone)} size={36} filled /> : null}
      {phone ? <IconButton icon={<MessageSquare size={18} color={colors.foreground} />} accessibilityLabel={`Text ${name}`} onPress={() => void contact("text", phone)} size={36} filled /> : null}
      {email ? <IconButton icon={<Mail size={18} color={colors.foreground} />} accessibilityLabel={`Email ${name}`} onPress={() => void contact("email", email)} size={36} filled /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: space.xs },
});
