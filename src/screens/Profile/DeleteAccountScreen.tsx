import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { accountActionError, requestAccountDeletion, resetAccountPassword } from "../../services/accountDeletion";
import { logOut } from "../../services/auth";
import { Action, ui } from "../../components/ui";
import { colors, radius, spacing } from "../../constants/theme";
import { SUPPORT_EMAIL, PRIVACY_POLICY_URL } from "../../constants/publicLinks";
import { openPublicLink } from "../../utils/openPublicLink";

export default function DeleteAccountScreen() {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const erase = async () => {
    setBusy(true); setError("");
    try {
      await requestAccountDeletion(password);
      setPassword(""); setAccepted(true);
      await logOut().catch(() => {});
      Alert.alert("Deletion requested", "Your account is now closed to new activity. Removal normally finishes within 24 hours. If you need help, email spotbnb1@gmail.com.");
    } catch (e) { setError(accountActionError(e)); }
    finally { setBusy(false); }
  };
  const confirm = () => Alert.alert("Permanently delete your account?", "Your profile, listings, photos, document-check results, reviews and booking conversations will be removed. This cannot be undone.", [
    { text: "Keep account", style: "cancel" }, { text: "Delete account", style: "destructive", onPress: () => void erase() },
  ]);
  const reset = async () => {
    setResetting(true); setError("");
    try { await resetAccountPassword(user?.email ?? ""); Alert.alert("Check your email", "If this email has an account, you will receive a password-reset link. Check your spam folder too."); }
    catch (e) { setError(accountActionError(e)); }
    finally { setResetting(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={ui.subheading}>Delete your SpotBnB account</Text>
      <Text style={ui.body}>This permanently removes your login, profile, parking listings and photos, document-check results, reviews and booking conversations. You will lose access to your booking history.</Text>
      <View style={styles.notice}>
        <Text style={ui.label}>Before you continue</Text>
        <Text style={ui.body}>Finish or cancel active bookings and settle your earnings first. Wait for any Stripe balance to reach your bank. If a refund or dispute prevents this, contact support.</Text>
      </View>
      <Text style={ui.body}>Limited booking and payment records are kept for up to 7 years for financial records and payment disputes. Your profile details are removed from those records. Stripe retains its own payment and payout records under its privacy policy.</Text>
      <Text style={ui.body}>Removal normally finishes within 24 hours. A minimal record preventing old login sessions from recreating data is kept for 7 days.</Text>
      {!accepted && <>
        <Text style={ui.label}>Confirm your password</Text>
        <TextInput accessibilityLabel="Current password" autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="password" autoComplete="current-password" value={password} onChangeText={setPassword} editable={!busy && !resetting} placeholder="Your current password" placeholderTextColor={colors.textMuted} selectionColor={colors.primary} style={styles.input} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Action label="Delete my account" onPress={confirm} busy={busy} disabled={!password || resetting} />
        <Action secondary label="Reset my password" onPress={() => void reset()} busy={resetting} disabled={busy} />
      </>}
      {accepted && <Text accessibilityRole="alert" style={ui.body}>Deletion requested. Your account is closed to new activity.</Text>}
      <Action secondary label={`Email ${SUPPORT_EMAIL}`} onPress={() => void openPublicLink(`mailto:${SUPPORT_EMAIL}?subject=SpotBnB%20account%20deletion`)} />
      <Action secondary label="Read privacy policy" onPress={() => void openPublicLink(PRIVACY_POLICY_URL)} />
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  notice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, gap: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  error: { color: colors.danger, lineHeight: 22 },
});
