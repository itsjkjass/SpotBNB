import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getBookingsForBuyer, getBookingsForSeller } from "../../services/bookings";
import { useAuth } from "../../hooks/useAuth";
import { Booking } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { BookingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<BookingsStackParamList, "BookingsList">;

const STATUS_LABELS: Record<Booking["status"], string> = {
  pending_payment: "Pending payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

const STATUS_COLORS: Record<Booking["status"], string> = {
  pending_payment: colors.accent,
  confirmed: colors.success,
  cancelled: colors.danger,
  completed: colors.textMuted,
};

export default function BookingsListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [asBuyer, asSeller] = await Promise.all([
        getBookingsForBuyer(user.uid),
        getBookingsForSeller(user.uid),
      ]);
      const merged = [...asBuyer, ...asSeller].sort((a, b) => b.startTime - a.startTime);
      setBookings(merged);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.notice}>No bookings yet.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("BookingDetail", { bookingId: item.id })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.spotTitle}</Text>
            <Text style={styles.cardAddress}>{item.spotAddress}</Text>
            <Text style={styles.cardDate}>
              {new Date(item.startTime).toLocaleString()} → {new Date(item.endTime).toLocaleString()}
            </Text>
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.status, { color: STATUS_COLORS[item.status] }]}>
              {STATUS_LABELS[item.status]}
            </Text>
            <Text style={styles.price}>${(item.totalPriceCents / 100).toFixed(2)}</Text>
            <Text style={styles.role}>{item.buyerId === user?.uid ? "Booked" : "Hosted"}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  notice: { color: colors.textMuted },
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
  cardDate: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  cardMeta: { alignItems: "flex-end", justifyContent: "space-between" },
  status: { fontSize: 12, fontWeight: "700" },
  price: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  role: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
