import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Switch, Image } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSpotsByOwner, updateSpot, deleteSpot } from "../../services/spots";
import { useAuth } from "../../hooks/useAuth";
import type { ParkingSpot } from "../../types/models"; // Actually import
import { colors, spacing, radius } from "../../constants/theme"; // Actually import
import type { MyListingsStackParamList } from "../../navigation/types";
import { supportsDailyBooking } from "../../utils/calendarDays";

import { Icon, ui, Choice } from "../../components/ui";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { MainTabsParamList } from "../../navigation/types";

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
    if (!spot.isActive && !supportsDailyBooking(spot)) {
      Alert.alert("Update your listing", "Set a valid daily price and full-day availability before showing this space in search.");
      return;
    }
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
            <Text accessibilityRole="header" style={ui.heading}>Your hosting</Text>
            <Text style={[ui.body, { marginTop: 8, marginBottom: 20 }]}>Put your space to good use.</Text>
            <View style={styles.shortcuts}>
              <Choice icon="calendar-outline" label="Bookings" onPress={() => navigation.getParent<BottomTabNavigationProp<MainTabsParamList>>()?.navigate("BookingsTab")} />
              <Choice icon="wallet-outline" label="Earnings" onPress={() => navigation.getParent<BottomTabNavigationProp<MainTabsParamList>>()?.navigate("ProfileTab", { screen: "Earnings" })} />
            </View>
            {!payoutSetupSubmitted && <TouchableOpacity style={styles.payoutNotice} accessibilityRole="button" onPress={() => navigation.navigate("SellerOnboarding")}>
              <Icon name="wallet-outline" color={colors.primary} />
              <View style={{ flex: 1 }}><Text style={ui.label}>Get ready to receive your earnings</Text>
              <Text style={[ui.body, { fontSize: 14 }]}>You can receive bookings now. Set up payouts before withdrawing.</Text></View>
              <Icon name="chevron-forward" size={18} />
            </TouchableOpacity>}
            <Text style={ui.subheading}>Your spaces · {spots.length}</Text>
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
            {item.photoUrls[0] ? <Image accessibilityLabel={item.title} source={{ uri: item.photoUrls[0] }} style={styles.listingPhoto} /> : <View style={[styles.listingPhoto, styles.placeholder]}><Icon name="car-outline" size={36} color={colors.primary} /></View>}
            <View style={styles.cardBody}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardAddress}>{item.address}</Text>
              <Text style={styles.cardPrice}>{item.pricePerDay ? `$${item.pricePerDay.toFixed(2)} CAD / day` : "Set a daily price to accept bookings"}</Text>
              <Text style={styles.step}>{!supportsDailyBooking(item) ? "Update daily pricing / availability to appear in search" : item.isActive ? "Visible in search" : "Hidden from search"}</Text>
            </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity disabled={busyId !== null} onPress={() => navigation.navigate("CreateListing", { spotId: item.id })}><Text style={styles.setupLink}>Edit space</Text></TouchableOpacity>
              <Switch accessibilityLabel={`Show ${item.title} in search`} disabled={busyId !== null} value={item.isActive} onValueChange={() => toggleActive(item)} />
              <TouchableOpacity disabled={busyId !== null} onPress={() => confirmDelete(item)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate("CreateListing", undefined)}>
        <Text style={styles.fabText}>+ Add a space</Text>
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
    backgroundColor: colors.paper,
    overflow: "hidden",
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  shortcuts: { flexDirection: "row", gap: 8, marginBottom: spacing.lg, flexWrap: "wrap" },
  payoutNotice: { ...ui.row, gap: 12, padding: spacing.md, backgroundColor: colors.primarySoft, borderRadius: radius.md, marginBottom: spacing.lg },
  listingPhoto: { width: "100%", aspectRatio: 1.9, backgroundColor: colors.primarySoft }, placeholder: { alignItems: "center", justifyContent: "center" },
  cardBody: { padding: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cardPrice: { fontSize: 14, fontWeight: "600", color: colors.primary, marginTop: spacing.xs },
  cardActions: { paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderColor: colors.border },
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
