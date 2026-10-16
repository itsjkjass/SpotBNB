import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { colors, radius, spacing } from "../../constants/theme";

const questions = [
  ["How do I find parking?", "Explore available spaces on Search. Open a listing to see its address, price and details. You can browse before creating an account; sign in when you are ready to book."],
  ["How do bookings and payments work?", "Choose a space and your parking times, then review the total before paying. Check Bookings for the confirmed status. If payment is interrupted, return to that booking to continue rather than making another reservation."],
  ["How do I list my space?", "Open My Listings and add your space. You can save a private draft before setting up payouts. In this version, Stripe seller setup is required before publishing a space for paid bookings."],
  ["How do I contact the buyer or seller?", "After payment confirms a booking, open its details and choose Message. Conversations also appear in Messages. Messaging is text only; cancelled bookings keep their history but cannot receive new messages."],
  ["How do I block or report a message?", "Open the conversation and select Block messages. Hold a received message to report spam or harassment. Blocking stops messages for that booking; it does not cancel the reservation. Reports are saved for SpotBnB, but this is not an emergency support channel."],
  ["What does Documents checked mean?", "An optional automated AI check compares visible document details and dates. It cannot prove authenticity, identity, ownership, insurance coverage or selfie liveness. A badge is not a safety guarantee. You can use the app without a badge."],
  ["Can I cancel a booking?", "Open the booking details to see whether cancellation is available. When a refund is issued, the time it takes to appear depends on the payment provider and your bank."],
];

export default function HelpScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Help">) {
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.heading}>How can we help?</Text>
    <Text style={styles.body}>A quick guide to finding, booking and sharing parking with SpotBnB.</Text>
    <TouchableOpacity style={styles.action} onPress={() => navigation.navigate("Tutorial")}><Text style={styles.link}>Show the app tour →</Text></TouchableOpacity>
    {questions.map(([question, answer]) => <View key={question} style={styles.section}><Text style={styles.title}>{question}</Text><Text style={styles.body}>{answer}</Text></View>)}
    <View style={styles.notice}><Text style={styles.title}>Contact support</Text><Text style={styles.body}>Support contact details are coming soon. During testing, report problems to the person who invited you to test SpotBnB. For an immediate safety emergency, contact your local emergency services.</Text></View>
    <TouchableOpacity style={styles.action} onPress={() => navigation.navigate("Privacy")}><Text style={styles.link}>Privacy policy status →</Text></TouchableOpacity>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background, gap: spacing.md },
  heading: { fontSize: 25, fontWeight: "700", color: colors.text }, title: { fontSize: 17, fontWeight: "600", color: colors.text },
  body: { color: colors.textMuted, lineHeight: 23, marginTop: spacing.sm },
  section: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: spacing.md },
  notice: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md },
  action: { paddingVertical: spacing.md }, link: { color: colors.primary, fontWeight: "600" },
});
