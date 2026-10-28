import { Platform } from "react-native";
import type { Edge } from "react-native-safe-area-context";

/**
 * The safe-area edges a full-screen sheet pads (a `Modal` with `presentationStyle="pageSheet"`). On iPhone the sheet
 * starts below the status bar, so only its bottom. On Android the Modal fills the screen edge to edge, so its top too:
 * without it the sheet's title and Done sat under the status bar, where a tap doesn't reach them.
 */
export const SHEET_EDGES: readonly Edge[] = Platform.OS === "android" ? ["top", "bottom"] : ["bottom"];
