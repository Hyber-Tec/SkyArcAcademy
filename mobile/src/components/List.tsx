import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { type Accent, radius, space, useAccents, useColors } from "@/theme";

/**
 * A group of rows under a small title, as in the phone's own Settings. `detail` sits at the right of the title (a
 * count, a total); `footer` below the group. With `icon`, the title shows it and takes its `tone` (the accents that tell
 * a page's parts apart: theme/index.ts).
 */
export function ListSection({
  title,
  detail,
  footer,
  icon: Icon,
  tone = "grey",
  children,
  testID,
}: {
  title?: string;
  detail?: ReactNode;
  footer?: ReactNode;
  icon?: LucideIcon;
  tone?: Accent;
  children: ReactNode;
  testID?: string;
}) {
  const colors = useColors();
  const accent = useAccents()[tone];
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<{ divider?: boolean }>[];
  return (
    <View style={styles.section} testID={testID}>
      {(title || detail) && (
        <View style={styles.head}>
          {Icon ? <Icon size={14} color={accent.fg} strokeWidth={2.4} style={styles.headIcon} /> : null}
          <T variant="small" tone="muted" style={[styles.title, Icon && { color: accent.fg }]}>
            {title?.toUpperCase()}
          </T>
          {typeof detail === "string" ? (
            <T variant="small" tone="muted" style={styles.detail}>
              {detail}
            </T>
          ) : (
            detail
          )}
        </View>
      )}
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>{rows.map((row, i) => (i === 0 ? row : cloneElement(row, { divider: true })))}</View>
      {typeof footer === "string" ? (
        <T variant="small" tone="muted" style={styles.footer}>
          {footer}
        </T>
      ) : (
        footer
      )}
    </View>
  );
}

/**
 * One row: an optional icon, a title with a line or two under it, and something at the right. With `onPress` it is
 * a button, and shows a chevron unless `chevron` says otherwise.
 */
export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  chevron = !!onPress,
  divider = false,
  destructive = false,
  testID,
  accessibilityLabel,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  /** Set by ListSection on every row after the first. */
  divider?: boolean;
  destructive?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const content = (
    <>
      {icon}
      <View style={styles.grow}>
        {typeof title === "string" ? (
          <T variant="label" tone={destructive ? "destructive" : "default"} numberOfLines={1}>
            {title}
          </T>
        ) : (
          title
        )}
        {typeof subtitle === "string" ? (
          <T variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </T>
        ) : (
          subtitle
        )}
      </View>
      {typeof right === "string" ? (
        <T variant="body" tone="muted">
          {right}
        </T>
      ) : (
        right
      )}
      {chevron && <ChevronRight size={16} color={colors.mutedForeground} />}
    </>
  );
  const line = divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  if (!onPress && !onLongPress)
    return (
      <View style={[styles.row, line]} testID={testID} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, line, pressed && { backgroundColor: colors.accent }]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

/** A square tinted tile for a row's icon, as the phone's Settings. */
export function RowIcon({ children, color }: { children: ReactNode; color?: string }) {
  const colors = useColors();
  return <View style={[styles.rowIcon, { backgroundColor: color ?? colors.secondary }]}>{children}</View>;
}

/** A row's icon in one of the app's accents: the icon in its colour on its tint. */
export function ToneIcon({ icon: Icon, tone, size = 17 }: { icon: LucideIcon; tone: Accent; size?: number }) {
  const accent = useAccents()[tone];
  return (
    <RowIcon color={accent.bg}>
      <Icon size={size} color={accent.fg} />
    </RowIcon>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.xs },
  headIcon: { marginTop: -1 },
  title: { flex: 1, fontWeight: "600", letterSpacing: 0.5 },
  detail: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  footer: { paddingHorizontal: space.xs },
  grow: { flex: 1, gap: 2 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});
