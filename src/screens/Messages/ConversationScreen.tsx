import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MessagesStackParamList } from "../../navigation/types";
import type { Booking } from "../../types/models";
import { useAuth } from "../../hooks/useAuth";
import { colors, radius, spacing } from "../../constants/theme";
import { getOlderMessages, markMessagesRead, newMessageId, reportMessage, sendMessage, setChatBlocked, subscribeBooking, subscribeChat, subscribeConversation, type ChatMessage, type Conversation, type MessageCursor } from "../../services/messages";

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  return [...new Map([...current, ...incoming].map(item => [item.id, item])).values()]
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}

export default function ConversationScreen({ route }: NativeStackScreenProps<MessagesStackParamList, "Conversation">) {
  return <BookingConversation key={route.params.bookingId} bookingId={route.params.bookingId} />;
}

function BookingConversation({ bookingId }: { bookingId: string }) {
  const { user } = useAuth();
  const focused = useIsFocused();
  const headerHeight = useHeaderHeight();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cursor = useRef<MessageCursor | undefined>(undefined);
  const pending = useRef<{ text: string; id: string } | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isBuyer = booking?.buyerId === user?.uid;
  const ownBlocked = isBuyer ? conversation?.buyerBlocked : conversation?.sellerBlocked;
  const blocked = conversation?.buyerBlocked || conversation?.sellerBlocked;
  const canSend = booking && ["confirmed", "completed"].includes(booking.status) && !blocked && !error;

  useFocusEffect(useCallback(() => {
    let active = true;
    generation.current += 1;
    setLoading(true); setError(null); setBooking(null); setConversation(null); setMessages([]); setHasOlder(false); setOlderBusy(false); cursor.current = undefined;
    const fail = () => { if (active) { setError("Couldn't load this conversation. Check your connection and try again."); setLoading(false); } };
    const stops = [
      subscribeBooking(bookingId, data => { if (active) { setBooking(data); setLoading(false); if (!data) fail(); } }, fail),
      subscribeConversation(bookingId, data => { if (active) setConversation(data); }, fail),
      subscribeChat(bookingId, (data, oldest) => {
        if (!active) return;
        setMessages(current => mergeMessages(current, data));
        if (!cursor.current) { cursor.current = oldest; setHasOlder(data.length === 40); }
      }, fail),
    ];
    return () => { active = false; generation.current += 1; stops.forEach(stop => stop()); };
  // Retry intentionally restarts failed subscriptions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, attempt]));

  useEffect(() => {
    const lastId = conversation?.lastMessageId;
    const unread = isBuyer ? conversation?.buyerUnread : conversation?.sellerUnread;
    if (focused && lastId && unread && messages.some(message => message.id === lastId)) {
      markMessagesRead(bookingId, lastId).catch(() => { /* Next snapshot/focus retries; messages remain readable. */ });
    }
  }, [focused, bookingId, conversation, messages, isBuyer]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending || !canSend) return;
    if (pending.current?.text !== value) pending.current = { text: value, id: newMessageId(bookingId) };
    setSending(true);
    try { await sendMessage(bookingId, pending.current.id, value); if (mounted.current) { setText(""); pending.current = null; } }
    catch (e) { if (mounted.current) Alert.alert("Message not sent", e instanceof Error ? e.message : "Please try again."); }
    finally { if (mounted.current) setSending(false); }
  };
  const older = async () => {
    if (!cursor.current || olderBusy) return;
    const currentGeneration = generation.current;
    setOlderBusy(true);
    try {
      const page = await getOlderMessages(bookingId, cursor.current);
      if (currentGeneration !== generation.current) return;
      setMessages(current => mergeMessages(current, page.messages));
      cursor.current = page.cursor ?? cursor.current; setHasOlder(page.hasMore);
    } catch { if (currentGeneration === generation.current) Alert.alert("Couldn't load older messages", "Please try again."); }
    finally { if (currentGeneration === generation.current) setOlderBusy(false); }
  };
  const block = () => Alert.alert(ownBlocked ? "Unblock messages?" : "Block messages?", "This changes messaging for this booking. It does not cancel your reservation.", [
    { text: "Keep current setting", style: "cancel" },
    { text: ownBlocked ? "Unblock" : "Block", onPress: () => { setChatBlocked(bookingId, !ownBlocked).catch(() => Alert.alert("Couldn't update messages", "Please try again.")); } },
  ]);
  const report = (message: ChatMessage) => {
    if (message.senderId === user?.uid) return;
    const submit = (reason: "harassment" | "spam" | "other") => {
      reportMessage(bookingId, message.id, reason).then(() => Alert.alert("Report saved", "You can also block further messages using the button above."))
        .catch(() => Alert.alert("Couldn't save report", "Please try again."));
    };
    Alert.alert("Report message", "Choose the reason for reporting this message.", [
      { text: "Harassment", onPress: () => submit("harassment") },
      { text: "Spam or scam", onPress: () => submit("spam") },
      { text: "Cancel", style: "cancel" },
    ]);
  };
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  return <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
    <View style={styles.header}><Text style={styles.title}>{booking?.spotTitle ?? "Booking conversation"}</Text>
      <Text style={styles.muted}>Chat with the {isBuyer ? "seller" : "buyer"}. Hold a received message to report it.</Text>
      {booking && <TouchableOpacity onPress={block}><Text style={styles.link}>{ownBlocked ? "Unblock messages" : "Block messages"}</Text></TouchableOpacity>}
    </View>
    {error && <View style={styles.header}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => setAttempt(n => n + 1)}><Text style={styles.link}>Try again</Text></TouchableOpacity></View>}
    <FlatList inverted data={messages} keyExtractor={item => item.id} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<Text style={[styles.muted, { textAlign: "center" }]}>No messages yet.</Text>}
      ListFooterComponent={hasOlder ? <TouchableOpacity disabled={olderBusy} onPress={older}><Text style={styles.link}>{olderBusy ? "Loading…" : "Load older messages"}</Text></TouchableOpacity> : null}
      renderItem={({ item }) => <TouchableOpacity activeOpacity={0.9} onLongPress={() => report(item)} style={[styles.bubble, item.senderId === user?.uid ? styles.own : styles.received]}>
        <Text style={styles.messageText}>{item.text}</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
      </TouchableOpacity>} />
    {!canSend && <Text style={styles.notice}>{blocked ? "Messaging is blocked for this booking." : booking?.status === "cancelled" ? "This booking was cancelled. You can still read past messages." : "Messaging becomes available when your booking is confirmed."}</Text>}
    <View style={styles.composer}><TextInput accessibilityLabel="Message" value={text} onChangeText={setText} maxLength={2000} multiline editable={!!canSend && !sending} placeholder="Write a message…" style={styles.input} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message" disabled={!canSend || !text.trim() || sending} onPress={send} style={[styles.send, (!canSend || !text.trim() || sending) && { opacity: 0.5 }]}>
        {sending ? <ActivityIndicator color="white" /> : <Text style={styles.sendText}>Send</Text>}
      </TouchableOpacity></View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 17, fontWeight: "700", color: colors.text }, muted: { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 20 },
  link: { color: colors.primary, paddingVertical: spacing.sm, fontWeight: "600" }, error: { color: colors.danger },
  messages: { padding: spacing.md }, bubble: { maxWidth: "85%", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  own: { alignSelf: "flex-end", backgroundColor: "#E1F2EA" }, received: { alignSelf: "flex-start", backgroundColor: colors.surface },
  messageText: { color: colors.text, fontSize: 16, lineHeight: 22 }, time: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, color: colors.text },
  send: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: spacing.md }, sendText: { color: "white", fontWeight: "700" },
  notice: { padding: spacing.md, color: colors.textMuted, backgroundColor: colors.surface },
});
