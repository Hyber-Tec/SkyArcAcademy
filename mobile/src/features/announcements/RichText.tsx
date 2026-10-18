import { Image } from "expo-image";
import { ImageOff } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";
import { T } from "@/components/Text";
import { openUrl, reachable } from "@/lib/links";
import { toast } from "@/lib/toast";
import { type Colors, radius, space, type, useColors } from "@/theme";
import type { Block, Inline, Marks } from "./html";

/** A picture in a post, to open full screen. */
export interface PostPicture {
  uri: string;
  alt: string;
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
/** Bullets for each depth of a list in a list, as a browser draws them. */
const BULLETS = ["•", "◦", "▪"];

/** Opens a link in a post: a web page in the phone's browser, an email or a phone number in the phone's own app. */
function openLink(href: string) {
  if (/^https?:/i.test(href)) {
    void openUrl(reachable(href));
    return;
  }
  Linking.openURL(href).catch(() => toast.error(/^mailto:/i.test(href) ? "No mail app to write with" : "Couldn’t open the link", { description: href.replace(/^(mailto|tel):/i, "") }));
}

/**
 * A post's content (its `contentHtml` as the website's editor writes it, read into blocks by html.ts: `htmlBlocks`),
 * drawn with the app's own text, colours and spacing in light and dark: paragraphs, headings, lists, quotes, code,
 * pictures (a tap opens one full screen, `onOpenPicture`) and links (opened in the phone's browser, or its mail or phone
 * app). Long words wrap.
 */
export function RichText({ blocks, onOpenPicture, testID }: { blocks: Block[]; onOpenPicture: (picture: PostPicture) => void; testID?: string }) {
  if (!blocks.length) return null;
  return (
    <View style={styles.blocks} testID={testID}>
      <Blocks blocks={blocks} depth={0} muted={false} onOpenPicture={onOpenPicture} />
    </View>
  );
}

function Blocks({ blocks, depth, muted, onOpenPicture }: { blocks: Block[]; depth: number; muted: boolean; onOpenPicture: (picture: PostPicture) => void }) {
  const colors = useColors();
  const text: TextStyle = { color: muted ? colors.mutedForeground : colors.foreground };
  return blocks.map((block, i) => {
    switch (block.kind) {
      case "paragraph":
        return (
          <Text key={i} style={[styles.body, text]}>
            {inlines(block.content, colors)}
          </Text>
        );
      case "heading":
        return (
          <Text key={i} accessibilityRole="header" style={[HEADINGS[block.level], text, i > 0 && styles.headingGap]}>
            {inlines(block.content, colors)}
          </Text>
        );
      case "list": {
        const last = block.start + block.items.length - 1;
        // Numbers lined up on their dots, however many digits the last one has.
        const marker = block.ordered ? 8 + String(last).length * 9 : 14;
        return (
          <View key={i} style={styles.list}>
            {block.items.map((item, n) => (
              <View key={n} style={styles.item}>
                <Text
                  style={[styles.body, text, styles.marker, { width: marker, textAlign: block.ordered ? "right" : "center" }]}
                  // A number is read out; a bullet isn't.
                  importantForAccessibility={block.ordered ? "auto" : "no"}
                  accessibilityElementsHidden={!block.ordered}
                >
                  {block.ordered ? `${block.start + n}.` : BULLETS[Math.min(depth, BULLETS.length - 1)]}
                </Text>
                <View style={styles.itemBody}>
                  <Blocks blocks={item} depth={depth + 1} muted={muted} onOpenPicture={onOpenPicture} />
                </View>
              </View>
            ))}
          </View>
        );
      }
      case "quote":
        return (
          <View key={i} style={[styles.quote, { borderLeftColor: colors.border }]}>
            <Blocks blocks={block.blocks} depth={depth} muted onOpenPicture={onOpenPicture} />
          </View>
        );
      case "code":
        return (
          <View key={i} style={[styles.code, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.mono, text]}>{block.text}</Text>
          </View>
        );
      case "image":
        return <Picture key={i} src={block.src} alt={block.alt} onOpen={onOpenPicture} />;
      case "rule":
        return <View key={i} style={[styles.rule, { backgroundColor: colors.border }]} />;
    }
    return null;
  });
}

/** A paragraph's pieces: plain text as it is, marked text in its style, links that open. */
function inlines(content: Inline[], colors: Colors): ReactNode[] {
  return content.map((piece, i) => {
    if (piece.kind === "break") return "\n";
    if (!Object.keys(piece.marks).length) return piece.text;
    const href = piece.marks.href;
    return (
      <Text
        key={i}
        style={markStyle(piece.marks, colors)}
        onPress={href ? () => openLink(href) : undefined}
        accessibilityRole={href ? "link" : undefined}
        accessibilityHint={href ? (/^https?:/i.test(href) ? "Opens the page" : undefined) : undefined}
      >
        {piece.text}
      </Text>
    );
  });
}

function markStyle(m: Marks, colors: Colors): TextStyle {
  const lines = [m.underline || m.href ? "underline" : null, m.strike ? "line-through" : null].filter(Boolean).join(" ");
  return {
    ...(m.bold ? { fontWeight: "700" as const } : null),
    ...(m.italic ? { fontStyle: "italic" as const } : null),
    ...(lines ? { textDecorationLine: lines as TextStyle["textDecorationLine"] } : null),
    ...(m.code ? { fontFamily: MONO, fontSize: 13.5, backgroundColor: colors.secondary } : null),
    ...(m.href ? { color: colors.info } : null),
  };
}

/** A picture: as wide as it is, up to the page's width, in its own shape; a tap opens it full screen. */
function Picture({ src, alt, onOpen }: { src: string; alt: string; onOpen: (picture: PostPicture) => void }) {
  const colors = useColors();
  const [room, setRoom] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const uri = reachable(src);
  const name = alt.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  const width = size ? Math.min(room, size.w) : room;
  const height = size ? (width * size.h) / size.w : Math.round(room * 0.6);
  return (
    <View onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.width))} style={styles.pictureRow}>
      {failed ? (
        <View style={[styles.pictureFailed, { borderColor: colors.border, backgroundColor: colors.cardMuted }]} testID="news-picture-failed">
          <ImageOff size={18} color={colors.mutedForeground} />
          <T variant="small" tone="muted" style={styles.shrink}>
            The picture couldn’t be loaded. Check your connection, then open the news again.
          </T>
        </View>
      ) : room ? (
        <Pressable
          onPress={() => onOpen({ uri, alt: name })}
          accessibilityRole="imagebutton"
          accessibilityLabel={name ? `Picture: ${name}` : "Picture"}
          accessibilityHint="Opens it full screen"
          style={({ pressed }) => pressed && styles.pressed}
          testID="news-picture"
        >
          <Image
            source={{ uri }}
            style={[styles.picture, { width, height, borderColor: colors.border, backgroundColor: size ? "transparent" : colors.secondary }]}
            contentFit="contain"
            transition={150}
            accessibilityIgnoresInvertColors
            onLoad={(e) => e.source.width > 0 && e.source.height > 0 && setSize({ w: e.source.width, h: e.source.height })}
            onError={() => setFailed(true)}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: space.md },
  body: { ...type.body, lineHeight: 22 },
  h1: { fontSize: 20, fontWeight: "600", letterSpacing: -0.2, lineHeight: 26 },
  h2: { fontSize: 17, fontWeight: "600", lineHeight: 23 },
  h3: { fontSize: 15, fontWeight: "600", lineHeight: 21 },
  headingGap: { marginTop: space.xs },
  list: { gap: 6 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  marker: { fontVariant: ["tabular-nums"] },
  itemBody: { flex: 1, gap: 6 },
  quote: { borderLeftWidth: 3, paddingLeft: space.md, gap: space.sm },
  code: { borderRadius: radius.md, padding: space.md },
  mono: { fontFamily: MONO, fontSize: 13, lineHeight: 19 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: space.xs },
  pictureRow: { alignSelf: "stretch" },
  picture: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.85 },
  pictureFailed: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  shrink: { flexShrink: 1 },
});

const HEADINGS = { 1: styles.h1, 2: styles.h2, 3: styles.h3 } as const;
