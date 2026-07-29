import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getBooking, cancelBooking } from "../../services/bookings";
import { submitReview } from "../../services/reviews";
import { useAuth } from "../hooks/useAuth";
import { Booking } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { BookingsStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<BookingsStackParamList, "BookingDetail">;

export default function BookingDetailScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const { user } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Current timestamp updated every second to avoid calling Date.now() during render
  const [now, setNow] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getBooking(bookingId)
      .then(setBooking)
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading || !booking || !user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isBuyer = booking.buyerId === user.uid;
  const canCancel =
    (booking.status === "pending_payment" || booking.status === "confirmed") &&
    booking.startTime > now;
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
    <View style={styles.container}>
      <Text style={styles.title}>{booking.spotTitle}</Text>
      <Text style={styles.address}>{booking.spotAddress}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Start</Text>
        <Text style={styles.value}>{new Date(booking.startTime).toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>End</Text>
        <Text style={styles.value}>{new Date(booking.endTime).toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Total</Text>
        <Text style={styles.value}>${(booking.totalPriceCents / 100).toFixed(2)} CAD</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{booking.status.replace("_", " ")}</Text>
      </View>

      {canCancel && (
        <TouchableOpacity style={styles.dangerButton} onPress={handleCancel} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cancel Booking</Text>}
        </TouchableOpacity>
      )}

      {canReview && (
        <View style={styles.reviewSection}>
          <Text style={styles.sectionTitle}>Leave a review</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  address: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: { color: colors.textMuted },
  value: { fontWeight: "600", color: colors.text },
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
  thanks: { marginTop: spacing.lg, color: colors.success, textAlign: "center", fontWeight: "600" },
});