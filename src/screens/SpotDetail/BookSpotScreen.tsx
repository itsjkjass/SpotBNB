import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import BookingDateTimePicker from "../../components/BookingDateTimePicker";
import { useStripe } from "@stripe/stripe-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSpot } from "../../services/spots";
import { requestBooking } from "../../services/bookings";
import { ParkingSpot } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { SearchStackParamList } from "../../navigation/types";

import { dateInZone, parkingTimeZone, pickerDate, pickerDateString, quoteCalendarBooking } from "../../utils/calendarDays";

type Props = NativeStackScreenProps<SearchStackParamList, "BookSpot">;

export default function BookSpotScreen({ route, navigation }: Props) {
  const { spotId } = route.params;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [spot, setSpot] = useState<ParkingSpot | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [payment, setPayment] = useState<Awaited<ReturnType<typeof requestBooking>> | null>(null);
  const [today, setToday] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    getSpot(spotId).then(value => {
      if (!active) return;
      if (!value) throw new Error("This space is no longer available.");
      const today = dateInZone(Date.now(), parkingTimeZone(value.timeZone));
      setToday(today);
      const first = route.params.startDate && route.params.startDate >= today ? route.params.startDate : today;
      const last = route.params.endDate && route.params.endDate >= first ? route.params.endDate : first;
      setSpot(value); setStartDate(first); setEndDate(last); setError(null);
    }).catch(e => { if (active) setError(e.message || "Couldn't load this space."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [spotId, loadAttempt, route.params.startDate, route.params.endDate]);

  let quote: ReturnType<typeof quoteCalendarBooking> | null = null;
  let quoteError = "";
  if (spot && startDate && endDate) {
    try { quote = quoteCalendarBooking(startDate, endDate, spot.pricePerDay, spot.timeZone); }
    catch (e) { quoteError = (e as Error).message; }
  }

  const handleConfirmAndPay = async () => {
    if (submitting.current || !quote) return;
    submitting.current = true;
    setError(null);
    setProcessing(true);
    try {
      // Retain the same reservation if the payment sheet is dismissed or fails.
      const reservation = payment ?? await requestBooking({
        spotId, startDate, endDate, expectedTotalPriceCents: quote.totalPriceCents,
      });
      setPayment(reservation);
      const { paymentIntentClientSecret } = reservation;

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
    } catch (e: unknown) {
      const message = (e as Error)?.message ?? "Something went wrong creating this booking.";
      setError(message);
    } finally {
      submitting.current = false;
      setProcessing(false);
    }
  };

  if (loading || !spot) {
    return <View style={styles.center}>
      {loading ? <ActivityIndicator size="large" color={colors.primary} /> : <>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => { setLoading(true); setLoadAttempt(n => n + 1); }}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </>}
    </View>;
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{spot.title}</Text>
      <Text style={styles.address}>{spot.address}</Text>
      <Text style={styles.label}>First parking date</Text>
      <BookingDateTimePicker value={pickerDate(startDate)} disabled={processing || Boolean(payment)}
        minimumDate={pickerDate(today)}
        onChange={date => { const value = pickerDateString(date); setStartDate(value); if (endDate < value) setEndDate(value); }} />
      <Text style={styles.label}>Last parking date (included)</Text>
      <BookingDateTimePicker value={pickerDate(endDate)} disabled={processing || Boolean(payment)}
        minimumDate={pickerDate(startDate)} onChange={date => setEndDate(pickerDateString(date))} />
      <Text style={styles.address}>Each selected date counts as one day, in {spot.timeZone ?? "America/Toronto"} time. Leave before midnight after your last parking date.</Text>
      {quote && <>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>${(quote.pricePerDayCents / 100).toFixed(2)} × {quote.dayCount} {quote.dayCount === 1 ? "day" : "days"}</Text>
          <Text style={styles.summaryValue}>${(quote.totalPriceCents / 100).toFixed(2)} CAD</Text>
        </View>
        <Text style={styles.address}>Cancel before the first booked date begins for a refund. Same-day bookings cannot be cancelled after payment.</Text>
      </>}
      {(error || quoteError) ? <Text style={styles.error}>{error || quoteError}</Text> : null}
      {payment && <Text style={styles.address}>Your reservation is held briefly while you finish payment. Retry here, or check its status in Bookings before starting another reservation.</Text>}
      <TouchableOpacity style={[styles.button, (!quote || processing) && { opacity: 0.5 }]}
        onPress={handleConfirmAndPay} disabled={processing || !quote}>
        {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{payment ? "Continue payment" : "Confirm and pay"}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
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
