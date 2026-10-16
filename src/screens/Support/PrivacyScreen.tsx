import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../../constants/theme";

export default function PrivacyScreen() {
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.heading}>SpotBnB privacy policy</Text>
    <View style={styles.notice}><Text style={styles.title}>Policy coming soon — testing placeholder</Text><Text style={styles.body}>SpotBnB is preparing its privacy policy. This page is an overview of app features, not the final policy. The operator details, privacy contact, retention periods, deletion process and published policy URL still need to be provided before public release.</Text></View>
    <Text style={styles.title}>Accounts and bookings</Text>
    <Text style={styles.body}>The app uses your account details to sign you in and connect you with your listings, reservations and messages. Firebase provides account and database services.</Text>
    <Text style={styles.title}>Location and listings</Text>
    <Text style={styles.body}>With your permission, the app uses your location to help you find parking. Active listings display their address, photos, description and price. Private drafts are visible to their owner.</Text>
    <Text style={styles.title}>Payments and payouts</Text>
    <Text style={styles.body}>Stripe processes payments and seller payout setup. The app keeps payment references and booking status; you enter payment details through Stripe.</Text>
    <Text style={styles.title}>Messages</Text>
    <Text style={styles.body}>Messages are stored for the buyer and seller on that booking. A report saves the reported message and reason for SpotBnB. Push notifications use a generic message notice rather than displaying the message text.</Text>
    <Text style={styles.title}>Optional document checks</Text>
    <Text style={styles.body}>When available, document checks ask for a separate agreement before sending images to Google Gemini. SpotBnB processes those images for the request without saving them in its database or file storage. The app saves the result, expiry, consent time and submission limits. Other users see only the badge status. You can remove your check result from the document-check screen.</Text>
    <Text style={styles.title}>Questions or requests</Text>
    <Text style={styles.body}>The privacy contact and formal account-deletion process are not available yet. During testing, contact the person who invited you. Avoid uploading sensitive documents until the document-check notice and service are ready.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 24, fontWeight: "700", color: colors.text }, title: { fontSize: 17, fontWeight: "600", color: colors.text },
  body: { color: colors.textMuted, lineHeight: 23 }, notice: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
});
