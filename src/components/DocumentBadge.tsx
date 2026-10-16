import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity } from "react-native";
import { subscribeDocumentBadge, type DocumentBadge as Badge, type DocumentRole } from "../services/verification";
import { colors, spacing } from "../constants/theme";

export default function DocumentBadge({ uid, role }: { uid: string; role: DocumentRole }) {
  return <AccountBadge key={`${uid}:${role}`} uid={uid} role={role} />;
}

function AccountBadge({ uid, role }: { uid: string; role: DocumentRole }) {
  const [badge, setBadge] = useState<Badge | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const stop = subscribeDocumentBadge(uid, role, setBadge, () => setBadge(null));
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => { stop(); clearInterval(timer); };
  }, [uid, role]);
  const checked = badge?.status === "checked" && typeof badge.expiresAt === "number" && badge.expiresAt > now;
  return <TouchableOpacity accessibilityRole="button" onPress={() => Alert.alert("About document checks",
    "An automated AI check looks at document readability, matching details and dates. It cannot independently establish identity, document authenticity, property or vehicle ownership, insurance coverage, or selfie liveness. A badge is not a safety guarantee.")}>
    <Text style={[styles.badge, checked && styles.checked]}>{role === "seller" ? "Seller" : "Buyer"} · {checked ? "Documents checked ✓" : "Not verified"} ⓘ</Text>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({ badge: { color: colors.textMuted, marginVertical: spacing.sm, fontSize: 13 }, checked: { color: colors.primary, fontWeight: "600" } });
