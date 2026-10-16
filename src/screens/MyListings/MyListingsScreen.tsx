import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Switch } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSpotsByOwner, updateSpot, deleteSpot } from "../../services/spots";
import { useAuth } from "../../hooks/useAuth";
import type { ParkingSpot } from "../../types/models"; // Actually import
import { colors, spacing, radius } from "../../constants/theme"; // Actually import
import type { MyListingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<MyListingsStackParamList, "MyListings">;

export default function MyListingsScreen({ navigation }: Props) {
  const { user, profile } = useAuth();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const payoutSetupSubmitted = profile?.stripeConnectOnboarded === true;

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setSpots(await getSpotsByOwner(user.uid));
    } catch {
      setError("Couldn't load your listings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleActive = async (spot: ParkingSpot) => {
    setBusyId(spot.id);
    try {
      await updateSpot(spot.id, { isActive: !spot.isActive });
      await load();
    } catch {
      Alert.alert("Couldn't update listing", "Please try again.");
    } finally { setBusyId(null); }
  };

  const confirmDelete = (spot: ParkingSpot) => {
    Alert.alert(
      "Delete listing",
      `Remove "${spot.title}"? This can&apos;t be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyId(spot.id);
            try {
              await deleteSpot(spot.id);
              await load();
            } catch {
              Alert.alert("Couldn't delete listing", "Please try again.");
            } finally { setBusyId(null); }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={spots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.setup}>
            <Text style={styles.cardTitle}>Your seller setup</Text>
            <Text style={styles.step}>✓ Account created</Text>
            <Text style={styles.step}>{spots.length ? "✓ Listing saved" : "○ Add your first listing"}</Text>
            <Text style={styles.step}>{payoutSetupSubmitted ? "✓ Payout details submitted" : "○ Set up payouts before withdrawing earnings"}</Text>
            {!payoutSetupSubmitted && <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate("SellerOnboarding")}>
              <Text style={styles.setupLink}>Set up payouts →</Text>
            </TouchableOpacity>}
            {error && <>
              <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.setupLink}>Try again</Text></TouchableOpacity>
            </>}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            {!error && <Text style={styles.notice}>Add your parking space now. You can finish seller setup afterward.</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardAddress}>{item.address}</Text>
              <Text style={styles.cardPrice}>${item.pricePerHour.toFixed(2)} CAD/hr</Text>
              <Text style={styles.step}>{item.isActive ? "Visible in search" : "Hidden from search"}</Text>
            </View>
            <View style={styles.cardActions}>
              <Switch accessibilityLabel={`Show ${item.title} in search`} disabled={busyId !== null} value={item.isActive} onValueChange={() => toggleActive(item)} />
              <TouchableOpacity disabled={busyId !== null} onPress={() => confirmDelete(item)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateListing", undefined)}>
        <Text style={styles.fabText}>+ New Listing</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  notice: { color: colors.textMuted, textAlign: "center" },
  list: { padding: spacing.lg, paddingBottom: 120 },
  setup: { paddingBottom: spacing.lg },
  step: { color: colors.textMuted, marginTop: spacing.sm },
  setupLink: { color: colors.primary, fontWeight: "600", paddingVertical: spacing.md },
  error: { color: colors.danger, marginTop: spacing.sm },
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cardPrice: { fontSize: 14, fontWeight: "600", color: colors.primary, marginTop: spacing.xs },
  cardActions: { alignItems: "flex-end", justifyContent: "space-between" },
  deleteText: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  fab: {
    position: "absolute",
    bottom: spacing.lg,
    right: spacing.lg,
    left: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
