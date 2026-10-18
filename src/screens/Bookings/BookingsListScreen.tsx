import { MotionPressable } from "../../components/Motion";
import { useScreenGuide } from "../../components/ScreenGuide";
import { displayCalendarDate } from "../../utils/calendarDays";
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getBookingsForBuyer, getBookingsForSeller } from "../../services/bookings";
import { useAuth } from "../../hooks/useAuth";
import { Booking } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import { Choice, EmptyState, Icon, ui } from "../../components/ui";
import { selectBookings } from "../../utils/bookingView";
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

export default function BookingsListScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const { firstTarget: guideFirstTarget, secondTarget: guideSecondTarget, overlay: guideOverlay } = useScreenGuide("bookings", !loading);

  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [role, setRole] = useState<"buyer" | "seller">(route.params?.role ?? "buyer");
  const [period, setPeriod] = useState<"upcoming" | "past">("upcoming");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (route.params?.role) { setRole(route.params.role); navigation.setParams({ role: undefined }); }
    if (!user) return;
    setLoading(true); setError(""); setNow(Date.now());
    Promise.all([getBookingsForBuyer(user.uid), getBookingsForSeller(user.uid)])
      .then(([buyer, seller]) => { if (active) setBookings([...buyer, ...seller]); })
      .catch(() => { if (active) setError("Couldn't refresh bookings. Check your connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // The attempt counter deliberately reloads after a failed request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, attempt, route.params?.role, navigation]));
  const visible = selectBookings(bookings, user?.uid ?? "", role, period, now);

  return (
    <>
    <FlatList
      data={visible}
      refreshing={loading}
      onRefresh={() => setAttempt(n => n + 1)}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.header}>
        <Text accessibilityRole="header" style={ui.heading}>Your bookings</Text>
        <Text style={ui.body}>Every parking day, in one place.</Text>
        <View ref={guideFirstTarget} collapsable={false} style={styles.filters}>
          <Choice label="My parking" icon="car-outline" selected={role === "buyer"} onPress={() => setRole("buyer")} />
          <Choice label="Hosting" icon="home-outline" selected={role === "seller"} onPress={() => setRole("seller")} />
        </View>
        <View ref={guideSecondTarget} collapsable={false} style={styles.filters}>
          <Choice label="Upcoming & current" selected={period === "upcoming"} onPress={() => setPeriod("upcoming")} />
          <Choice label="Past" selected={period === "past"} onPress={() => setPeriod("past")} />
        </View>
        {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Choice label="Try again" onPress={() => setAttempt(n => n + 1)} /></View> : null}
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} /> : !error ?
        <EmptyState icon="calendar-outline" title={period === "past" ? "No past bookings" : "Your next parking day awaits"}
          body={role === "seller" ? "Bookings for your spaces will appear here after someone reserves." : "Browse Explore to find a space. Your reservations and payment status will appear here."} /> : null}
      renderItem={({ item }) => (
        <MotionPressable
          style={styles.card}
          onPress={() => navigation.navigate("BookingDetail", { bookingId: item.id })}
        >
          <View style={styles.cardTop}><Icon name={role === "buyer" ? "car-outline" : "home-outline"} color={colors.primary} /><Text style={[styles.status, { color: STATUS_COLORS[item.status] }]}>{item.cancellationRequestedAt && item.status !== "cancelled" ? "Cancellation processing" : STATUS_LABELS[item.status]}</Text></View>
          <View>
            <Text style={styles.cardTitle}>{item.spotTitle}</Text>
            <Text style={styles.cardAddress}>{item.spotAddress}</Text>
            <Text style={styles.cardDate}>
              {item.startDate ? displayCalendarDate(item.startDate) : new Date(item.startTime).toLocaleString()} → {item.endDate ? displayCalendarDate(item.endDate) : new Date(item.endTime).toLocaleString()}
            </Text>
          </View>
          <View style={styles.cardMeta}>

            <Text style={styles.price}>${(item.totalPriceCents / 100).toFixed(2)} CAD</Text>
            <Text style={styles.role}>View booking →</Text>
          </View>
        </MotionPressable>
      )}
    />
    {guideOverlay}
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginBottom: spacing.lg },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  error: { color: colors.danger, marginBottom: spacing.sm },
  cardTop: { ...ui.row, justifyContent: "space-between", marginBottom: spacing.md },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  notice: { color: colors.textMuted },
  list: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cardDate: { fontSize: 14, lineHeight: 22, color: colors.textMuted, marginTop: spacing.xs },
  cardMeta: { ...ui.row, justifyContent: "space-between", flexWrap: "wrap", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  status: { fontSize: 12, fontWeight: "700" },
  price: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  role: { fontSize: 14, color: colors.primary, marginTop: 2 },
});
