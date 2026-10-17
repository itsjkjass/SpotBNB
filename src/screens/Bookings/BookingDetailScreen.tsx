import { displayCalendarDate } from "../../utils/calendarDays";
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getBooking, cancelBooking } from "../../services/bookings";
import { submitReview } from "../../services/reviews";
import { useAuth } from "../../hooks/useAuth";
import { Booking } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { BookingsStackParamList } from "../../navigation/types";
import type { MainTabsParamList } from "../../navigation/types";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

import { useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { EmptyState, ui } from "../../components/ui";

type Props = NativeStackScreenProps<BookingsStackParamList, "BookingDetail">;

export default function BookingDetailScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const { user } = useAuth();
  const headerHeight = useHeaderHeight();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Current timestamp updated every second to avoid calling Date.now() during render
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError(""); setNow(Date.now());
    getBooking(bookingId).then(value => {
      if (active) { setBooking(value); if (!value) setError("This booking is unavailable."); }
    }).catch(() => { if (active) setError("Couldn't load your booking. Check your connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Retrying deliberately reloads this booking.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, attempt]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (error || !booking || !user) return <EmptyState icon="calendar-outline" title="Booking unavailable" body={error || "Please return to Bookings and try again."} action="Try again" onPress={() => setAttempt(n => n + 1)} />;

  const isBuyer = booking.buyerId === user.uid;
  const canCancel =
    (booking.status === "pending_payment" || booking.status === "confirmed") &&
    booking.startTime > now && !booking.cancellationRequestedAt;
  const canReview = isBuyer && booking.status === "completed" && !reviewSubmitted;

  const handleCancel = () => {
    Alert.alert(
      "Cancel booking",
      "Are you sure you want to cancel this booking?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, cancel",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await cancelBooking(bookingId);
              const refreshed = await getBooking(bookingId);
              setBooking(refreshed);
            } catch (e: unknown) {
              const message = (e as Error)?.message ?? "Please try again.";
              Alert.alert("Couldn't cancel", message);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const handleSubmitReview = async () => {
    setBusy(true);
    try {
      await submitReview({
        bookingId,
        spotId: booking.spotId,
        authorId: user.uid,
        targetId: booking.sellerId,
        rating,
        comment,
      });
      setReviewSubmitted(true);
    } catch (e: unknown) {
      const message = (e as Error)?.message ?? "Please try again.";
      Alert.alert("Couldn't submit review", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={headerHeight}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{booking.spotTitle}</Text>
      <Text style={styles.address}>{booking.spotAddress}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{booking.startDate ? "First date" : "Start"}</Text>
        <Text style={styles.value}>{booking.startDate ? displayCalendarDate(booking.startDate) : new Date(booking.startTime).toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{booking.endDate ? "Last date (included)" : "End"}</Text>
        <Text style={styles.value}>{booking.endDate ? displayCalendarDate(booking.endDate) : new Date(booking.endTime).toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Total</Text>
        <Text style={styles.value}>${(booking.totalPriceCents / 100).toFixed(2)} CAD</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{booking.cancellationRequestedAt && booking.status !== "cancelled" ? "Cancellation processing" : booking.status.replace("_", " ")}</Text>
      </View>

      {booking.timeZone && <Text style={styles.address}>Parking dates use {booking.timeZone} time.</Text>}

      {booking.status === "pending_payment" && <View style={styles.paymentNotice}>
        <Text style={ui.body}>Payment is not confirmed yet. If you just paid, refresh the status before trying another reservation. Unpaid reservations are released automatically.</Text>
        <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => setAttempt(n => n + 1)}><Text style={styles.buttonText}>Refresh payment status</Text></TouchableOpacity>
      </View>}
      {canCancel && (
        <TouchableOpacity style={styles.dangerButton} onPress={handleCancel} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cancel Booking</Text>}
        </TouchableOpacity>
      )}

      {booking.status !== "pending_payment" && (
        <TouchableOpacity style={styles.button} onPress={() => navigation.getParent<BottomTabNavigationProp<MainTabsParamList>>()?.navigate("MessagesTab", { screen: "Conversation", params: { bookingId } })}>
          <Text style={styles.buttonText}>{booking.status === "cancelled" ? "View booking messages" : `Message ${isBuyer ? "seller" : "buyer"}`}</Text>
        </TouchableOpacity>
      )}

      {canReview && (
        <View style={styles.reviewSection}>
          <Text style={styles.sectionTitle}>Leave a review</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={`${n} stars`}
                accessibilityState={{ checked: rating === n }}
                onPress={() => setRating(n)}
              >
                <Text style={[styles.star, n <= rating && styles.starActive]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="How was this parking spot?"
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <TouchableOpacity style={styles.button} onPress={handleSubmitReview} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Review</Text>}
          </TouchableOpacity>
        </View>
      )}

      {reviewSubmitted && <Text style={styles.thanks}>Thanks for your review!</Text>}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { ...ui.heading },
  address: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: { color: colors.textMuted },
  value: { fontWeight: "600", color: colors.text, flexShrink: 1 },
  dangerButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  reviewSection: { marginTop: spacing.xl },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  starRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  star: { fontSize: 32, color: colors.border },
  starActive: { color: colors.accent },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    backgroundColor: colors.surface,
  },
  paymentNotice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft, marginVertical: spacing.md },
  thanks: { marginTop: spacing.lg, color: colors.success, textAlign: "center", fontWeight: "600" },
});
