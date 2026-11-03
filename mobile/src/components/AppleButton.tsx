import * as AppleAuthentication from "expo-apple-authentication";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { radius, useIsDark } from "@/theme";

/**
 * Apple's own "Continue with Apple" button (Apple's design rules ask for it, or one drawn as theirs), black in light
 * mode and white in dark, as tall and round as the app's large buttons. iPhones only (`useAuth().appleAvailable`).
 */
export function AppleButton({ onPress, busy, disabled, testID }: { onPress: () => void; busy?: boolean; disabled?: boolean; testID?: string }) {
  const dark = useIsDark();
  const off = busy || disabled;
  return (
    <View pointerEvents={off ? "none" : "auto"} style={{ opacity: off ? 0.5 : 1 }} testID={testID}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.md}
        style={styles.button}
        onPress={onPress}
      />
      {busy ? (
        <View style={styles.busy} pointerEvents="none">
          <ActivityIndicator color={dark ? "#000000" : "#ffffff"} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, width: "100%" },
  busy: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "flex-end", justifyContent: "center", paddingRight: 18 },
});
