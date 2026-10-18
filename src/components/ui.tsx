import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, depth, radius, spacing } from "../constants/theme";

import { MotionPressable, Reveal } from "./Motion";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];
export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Action({ label, onPress, secondary = false, busy = false, disabled = false }: {
  label: string; onPress: () => void; secondary?: boolean; busy?: boolean; disabled?: boolean;
}) {
  return <MotionPressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress}
    style={[styles.action, secondary && styles.secondary, (disabled || busy) && styles.disabled]}>
    {busy ? <ActivityIndicator color={secondary ? colors.primary : colors.paper} /> :
      <Text style={[styles.actionText, secondary && { color: colors.primary }]}>{label}</Text>}
  </MotionPressable>;
}
export function Choice({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  return <MotionPressable accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} onPress={onPress}
    style={[styles.choice, selected && styles.choiceSelected]}>
    {icon && <Icon name={icon} size={18} color={selected ? colors.paper : colors.text} />}
    <Text style={[styles.choiceText, selected && { color: colors.paper }]}>{label}</Text>
  </MotionPressable>;
}
export function EmptyState({ title, body, icon = "location-outline", action, onPress }: {
  title: string; body: string; icon?: IconName; action?: string; onPress?: () => void;
}) {
  return <Reveal style={styles.empty}>
    <View style={styles.emptyIcon}><Icon name={icon} size={30} color={colors.primary} /></View>
    <Text style={styles.emptyTitle}>{title}</Text><Text style={styles.body}>{body}</Text>
    {action && onPress && <Action label={action} onPress={onPress} secondary />}
  </Reveal>;
}
export const ui = StyleSheet.create({
  heading: { color: colors.text, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, fontWeight: "700" },
  subheading: { color: colors.text, fontSize: 22, lineHeight: 29, letterSpacing: -0.4, fontWeight: "600" },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  label: { color: colors.text, fontSize: 14, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
const styles = StyleSheet.create({
  action: { ...depth.soft, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center", padding: spacing.md },
  secondary: { backgroundColor: colors.primarySoft }, actionText: { color: colors.paper, fontSize: 16, fontWeight: "600" },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.75 },
  choice: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, choiceText: { fontSize: 14, fontWeight: "500", color: colors.text },
  empty: { padding: spacing.lg, alignItems: "center", gap: spacing.md }, emptyIcon: { ...depth.soft, padding: spacing.md, backgroundColor: colors.primarySoft, borderRadius: radius.lg },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "600", textAlign: "center" }, body: { ...ui.body, textAlign: "center" },
});
