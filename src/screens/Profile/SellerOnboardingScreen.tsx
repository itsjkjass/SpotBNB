import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { getSellerOnboardingLink, getSellerConnectStatus } from "../../services/stripeConnect";
import { useAuth } from "../../hooks/useAuth";
import { colors, spacing, radius } from "../../constants/theme";

export default function SellerOnboardingScreen() {
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<{ onboarded: boolean; payoutsEnabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = async () => {
    setBusy(true);
    try {
      const result = await getSellerConnectStatus();
      setStatus(result);
      await refreshProfile();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartOnboarding = async () => {
    setBusy(true);
    try {
      const url = await getSellerOnboardingLink("spotbnb://onboarding-complete", "spotbnb://onboarding-complete");
      await Linking.openURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Get paid for your parking spot</Text>
      <Text style={styles.description}>
        SpotBnB uses Stripe to pay sellers directly and securely. You'll need to complete a short
        onboarding form (identity + bank account) before you can list a spot.
      </Text>

      {busy && !status ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Onboarding</Text>
            <Text style={status?.onboarded ? styles.statusOk : styles.statusPending}>
              {status?.onboarded ? "Complete" : "Not started"}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Payouts</Text>
            <Text style={status?.payoutsEnabled ? styles.statusOk : styles.statusPending}>
              {status?.payoutsEnabled ? "Enabled" : "Not enabled"}
            </Text>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleStartOnboarding} disabled={busy}>
            <Text style={styles.buttonText}>
              {status?.onboarded ? "Update payout details" : "Start onboarding"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={loadStatus} disabled={busy}>
            <Text style={styles.secondaryButtonText}>Refresh status</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  description: { color: colors.textMuted, marginTop: spacing.sm, lineHeight: 20 },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusLabel: { color: colors.textMuted },
  statusOk: { color: colors.success, fontWeight: "700" },
  statusPending: { color: colors.accent, fontWeight: "700" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: { alignItems: "center", marginTop: spacing.md },
  secondaryButtonText: { color: colors.primary, fontWeight: "600" },
});
