import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MessagesStackParamList } from "../../navigation/types";
import { subscribeInbox, type Conversation } from "../../services/messages";
import { useAuth } from "../../hooks/useAuth";
import { colors, radius, spacing } from "../../constants/theme";

import { EmptyState, Icon, ui } from "../../components/ui";

export default function MessagesScreen({ navigation }: NativeStackScreenProps<MessagesStackParamList, "Inbox">) {
  const { user } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!user) return;
    setLoading(true); setError(false);
    return subscribeInbox(user.uid, data => { setItems(data); setLoading(false); }, () => { setError(true); setLoading(false); });
  // Retry intentionally recreates subscriptions even though its counter isn't sent to Firestore.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attempt]));
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (error) return <View style={styles.center}><Text>Couldn&apos;t load your messages.</Text><TouchableOpacity onPress={() => setAttempt(n => n + 1)}><Text style={styles.link}>Try again</Text></TouchableOpacity></View>;
  return <FlatList contentContainerStyle={styles.list} data={items} keyExtractor={item => item.id}
    ListHeaderComponent={<View style={{ marginBottom: spacing.lg }}><Text style={ui.heading}>Your conversations</Text><Text style={ui.body}>Keep parking plans together.</Text></View>}
    ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title="A place to connect" body="After a booking is confirmed, open its details to message the buyer or seller." />}
    renderItem={({ item }) => {
      const unread = user?.uid === item.buyerId ? item.buyerUnread : item.sellerUnread;
      return <TouchableOpacity accessibilityRole="button" style={styles.row} onPress={() => navigation.navigate("Conversation", { bookingId: item.id })}>
        <View style={styles.chatIcon}><Icon name="chatbubble-outline" color={colors.primary} /></View>
        <View style={{ flex: 1 }}><Text style={styles.title}>{item.spotTitle}</Text>
          <Text style={styles.description}>{user?.uid === item.buyerId ? "Seller" : "Buyer"} · {new Date(item.updatedAt).toLocaleDateString()}</Text>
          <Text numberOfLines={2} style={styles.preview}>{item.lastMessage || "No messages yet"}</Text></View>
        {unread > 0 && <Text accessibilityLabel={`${unread} unread messages`} style={styles.badge}>{unread > 99 ? "99+" : unread}</Text>}
      </TouchableOpacity>;
    }} />;
}
const styles = StyleSheet.create({
  center: { flex: 1, padding: spacing.lg, justifyContent: "center", alignItems: "center" },
  list: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, gap: spacing.sm },
  chatIcon: { backgroundColor: colors.primarySoft, padding: 12, borderRadius: radius.md },
  title: { fontWeight: "700", fontSize: 17, color: colors.text },
  description: { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 21 },
  preview: { color: colors.text, marginTop: spacing.sm },
  link: { color: colors.primary, padding: spacing.md },
  badge: { backgroundColor: colors.primary, color: "white", borderRadius: radius.lg, paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden" },
});
