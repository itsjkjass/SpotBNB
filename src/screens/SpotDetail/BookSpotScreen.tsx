import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useStripe } from "@stripe/stripe-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSpot } from "../../services/spots";
import { requestBooking, getSpotBookingsInRange } from "../../services/bookings";
import { ParkingSpot } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { SearchStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SearchStackParamList, "BookSpot">;

export default function BookSpotScreen({ route, navigation }: Props) {
  const { spotId } = route.params;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [spot, setSpot] = useState<ParkingSpot | null>(null);
  const [startTime, setStartTime] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [endTime, setEndTime] = useState(new Date(Date.now() + 3 * 60 * 60 * 1000));
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSpot(spotId).then(setSpot);
  }, [spotId]);

  const hours = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));
  const estimatedTotal = spot ? hours * spot.pricePerHour : 0;

  const handleConfirmAndPay = async () => {
    setError(null);
    if (endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }

    setProcessing(true);
    try {
      const overlapping = await getSpotBookingsInRange(spotId, startTime.getTime(), endTime.getTime());
      if (overlapping.length > 0) {
        setError("This spot is already booked for part of that time range. Pick a different time.");
        return;
      }

      const { paymentIntentClientSecret } = await requestBooking({
        spotId,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
      });

      const initResult = await initPaymentSheet({
        merchantDisplayName: "SpotBnB",
        paymentIntentClientSecret,
        returnURL: "spotbnb://stripe-redirect",
      });
      if (initResult.error) {
        setError(initResult.error.message);
        return;
      }

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) {
        if (presentResult.error.code !== "Canceled") {
          setError(presentResult.error.message);
        }
        return;
      }

      navigation.getParent()?.navigate("BookingsTab" as never);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong creating this booking.");
    } finally {
      setProcessing(false);
    }
  };

  if (!spot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{spot.title}</Text>
      <Text style={styles.address}>{spot.address}</Text>

      <Text style={styles.label}>Start</Text>
      <DateTimePicker
        value={startTime}
        mode="datetime"
        display={Platform.OS === "ios" ? "compact" : "default"}
        onChange={(_, date) => date && setStartTime(date)}
        minimumDate={new Date()}
      />

      <Text style={styles.label}>End</Text>
      <DateTimePicker
        value={endTime}
        mode="datetime"
        display={Platform.OS === "ios" ? "compact" : "default"}
        onChange={(_, date) => date && setEndTime(date)}
        minimumDate={startTime}
      />

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Duration</Text>
        <Text style={styles.summaryValue}>{hours.toFixed(1)} hours</Text>
      </View>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Estimated total</Text>
        <Text style={styles.summaryValue}>${estimatedTotal.toFixed(2)} CAD</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleConfirmAndPay} disabled={processing}>
        {processing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Confirm and Pay</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  address: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: spacing.md },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryLabel: { color: colors.textMuted },
  summaryValue: { fontWeight: "700", color: colors.text },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: "center" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
