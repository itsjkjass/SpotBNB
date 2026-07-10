import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Switch } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSpotsByOwner, updateSpot, deleteSpot } from "../../services/spots";
import { useAuth } from "../../hooks/useAuth";
import { ParkingSpot } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { MyListingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<MyListingsStackParamList, "MyListings">;

export default function MyListingsScreen({ navigation }: Props) {
  const { user, profile } = useAuth();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setSpots(await getSpotsByOwner(user.uid));
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
    await updateSpot(spot.id, { isActive: !spot.isActive });
    load();
  };

  const confirmDelete = (spot: ParkingSpot) => {
    Alert.alert("Delete listing", `Remove "${spot.title}"? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteSpot(spot.id);
          load();
        },
      },
    ]);
  };

  if (!profile?.stripeConnectOnboarded) {
    return (
      <View style={styles.center}>
        <Text style={styles.notice}>
          Set up payouts in your Profile tab before you can list a parking spot.
        </Text>
      </View>
    );
  }

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
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.notice}>You haven't listed any parking spots yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardAddress}>{item.address}</Text>
              <Text style={styles.cardPrice}>${item.pricePerHour.toFixed(2)} CAD/hr</Text>
            </View>
            <View style={styles.cardActions}>
              <Switch value={item.isActive} onValueChange={() => toggleActive(item)} />
              <TouchableOpacity onPress={() => confirmDelete(item)}>
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
  list: { padding: spacing.lg },
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
