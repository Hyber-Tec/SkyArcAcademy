import { SymbolView } from "expo-symbols";
import { KeyRound } from "lucide-react-native";

/** Apple's logo, as the iPhone draws it (its own symbol); Android, which has no Apple sign-in, shows a key. */
export function AppleMark({ size = 18, color }: { size?: number; color: string }) {
  return <SymbolView name="apple.logo" tintColor={color} style={{ width: size, height: size }} fallback={<KeyRound size={size} color={color} />} />;
}
