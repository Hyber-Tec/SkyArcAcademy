import { useLocalSearchParams } from "expo-router";
import { FileView } from "@/features/drive/FileView";

const GONE = { title: "This file isn’t in the Drive", text: "It may have been moved to the Trash on the website." };

/** A Drive file, full screen (loaded by ID): a picture to zoom into, or a PDF in a viewer (src/features/drive/FileView.tsx). */
export default function FileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FileView id={id ?? null} gone={GONE} />;
}
