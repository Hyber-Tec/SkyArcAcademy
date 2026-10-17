import * as Haptics from "expo-haptics";
import { ActionSheetIOS, Alert, Platform } from "react-native";

export interface SheetAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

/**
 * A short menu of what can be done with something (a long press on a row): the phone's own action sheet on iPhone, an
 * alert on Android (which shows two actions at most, so the first two are the ones that matter).
 */
export function showActions(title: string, actions: SheetAction[], message?: string): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...actions.map((a) => a.label), "Cancel"],
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: actions.flatMap((a, i) => (a.destructive ? [i] : [])),
      },
      (i) => actions[i]?.onPress(),
    );
    return;
  }
  Alert.alert(
    title,
    message,
    [...actions.slice(0, 2).map((a) => ({ text: a.label, style: a.destructive ? ("destructive" as const) : ("default" as const), onPress: a.onPress })), { text: "Cancel", style: "cancel" as const }],
    { cancelable: true },
  );
}
