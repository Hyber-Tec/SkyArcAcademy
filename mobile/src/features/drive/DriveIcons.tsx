import { type FileCategory, categoryOf } from "@shared/drive/files";
import { File, FileSpreadsheet, FileText, FileVideo, Image, Presentation } from "lucide-react-native";
import type { ComponentType } from "react";
import Svg, { Circle, G, Path } from "react-native-svg";
import { useColors, useIsDark } from "@/theme";

/**
 * The Drive's pictures, as the website draws them (web/src/features/drive/parts.tsx): its yellow folder, with a person
 * on a student's own folder, and a file's icon in its kind's colour.
 */

export function FolderGlyph({ student = false, size = 30 }: { student?: boolean; size?: number }) {
  return (
    <Svg width={size} height={(size * 26) / 32} viewBox="0 0 32 26" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7.2c.7 0 1.3.3 1.8.8L16 5.5h11.5A2.5 2.5 0 0 1 30 8v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" fill="#f4b73f" />
      <Path d="M2 9h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" fill="#ffcf5c" />
      {student ? (
        <G fill="#b07a12">
          <Circle cx="16" cy="14.2" r="2.6" />
          <Path d="M10.6 21.2c.6-2.6 2.9-4.2 5.4-4.2s4.8 1.6 5.4 4.2z" />
        </G>
      ) : null}
    </Svg>
  );
}

type Icon = ComponentType<{ size?: number; color?: string }>;

/** Each kind's icon and colour (the website's, a shade lighter on the dark background). */
const ICONS: Record<FileCategory, { icon: Icon; light: string | null; dark: string | null }> = {
  pdf: { icon: FileText, light: "#dc2626", dark: "#f87171" },
  image: { icon: Image, light: "#059669", dark: "#34d399" },
  document: { icon: FileText, light: "#2563eb", dark: "#60a5fa" },
  spreadsheet: { icon: FileSpreadsheet, light: "#15803d", dark: "#4ade80" },
  presentation: { icon: Presentation, light: "#ea580c", dark: "#fb923c" },
  video: { icon: FileVideo, light: "#7c3aed", dark: "#a78bfa" },
  text: { icon: FileText, light: null, dark: null },
  other: { icon: File, light: null, dark: null },
};

export function FileGlyph({ kind, size = 26 }: { kind: string; size?: number }) {
  const colors = useColors();
  const dark = useIsDark();
  const { icon: Icon, light, dark: night } = ICONS[categoryOf(kind)];
  return <Icon size={size} color={(dark ? night : light) ?? colors.mutedForeground} />;
}
