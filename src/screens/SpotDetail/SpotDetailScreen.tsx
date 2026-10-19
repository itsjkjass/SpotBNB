import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSpot } from "../../services/spots";
import { getReviewsForSpot } from "../../services/reviews";
import { ParkingSpot, Review } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { SearchStackParamList } from "../../navigation/types";
import DocumentBadge from "../../components/DocumentBadge";
import { supportsDailyBooking } from "../../utils/calendarDays";
import { displayCalendarDate } from "../../utils/calendarDays";
import { Icon, ui } from "../../components/ui";
import ParkingDirections from "../../components/ParkingDirections";

type Props = NativeStackScreenProps<SearchStackParamList, "SpotDetail">;

export default function SpotDetailScreen({ route, navigation }: Props) {
  const { spotId } = route.params;
  const { width } = useWindowDimensions();
  const [spot, setSpot] = useState<ParkingSpot | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [spotData, reviewData] = await Promise.all([getSpot(spotId), getReviewsForSpot(spotId)]);
        if (active) { setSpot(spotData); setReviews(reviewData); }
      } catch {
        if (active) { setSpot(null); setError("This listing may no longer be available. Return to Search and try again."); }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [spotId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!spot) {
    return (
      <View style={styles.center}>
        <Text>{error ?? "This listing is no longer available."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        {spot.photoUrls.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {spot.photoUrls.map((url) => (
              <Image key={url} accessibilityLabel={spot.title} source={{ uri: url }} style={[styles.photo, { width }]} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder, { width }]}>
            <Icon name="car-outline" size={48} color={colors.primary} />
            <Text style={{ color: colors.textMuted }}>No photos yet</Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.title}>{spot.title}</Text>
          <DocumentBadge uid={spot.ownerId} role="seller" />
          <Text style={styles.address}>{spot.address}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{spot.pricePerDay ? `$${spot.pricePerDay.toFixed(2)} CAD / day` : "Daily price not set"}</Text>
          </View>

          {spot.reviewCount > 0 && (
            <Text style={styles.rating}>
              ★ {spot.averageRating.toFixed(1)} ({spot.reviewCount} reviews)
            </Text>
          )}

          <Text style={styles.sectionTitle}>About this space</Text>
          <Text style={styles.description}>{spot.description}</Text>

          <ParkingDirections coordinate={spot.location} />
          <View style={styles.facts}>
            <View style={styles.fact}><Icon name="home-outline" color={colors.primary} /><Text style={styles.detail}>{spot.spotType.charAt(0).toUpperCase() + spot.spotType.slice(1)}</Text></View>
            <View style={styles.fact}><Icon name="car-outline" color={colors.primary} /><Text style={styles.detail}>{spot.vehicleSizes.map(size => size === "suv_truck" ? "SUV / truck" : size.charAt(0).toUpperCase() + size.slice(1)).join(" · ")}</Text></View>
          </View>
          {spot.amenities.length > 0 && (
            <Text style={styles.detail}>Amenities: {spot.amenities.join(", ")}</Text>
          )}
          <TouchableOpacity accessibilityRole="button" disabled={!spot.isActive || !supportsDailyBooking(spot)} style={styles.dateRow} onPress={() => navigation.navigate("BookSpot", { ...route.params })}>
            <Icon name="calendar-outline" color={colors.primary} />
            <View style={{ flex: 1 }}><Text style={ui.label}>Your parking dates</Text><Text style={styles.detail}>{route.params.startDate && route.params.endDate ? `${displayCalendarDate(route.params.startDate)} – ${displayCalendarDate(route.params.endDate)}` : "Choose your calendar dates"}</Text></View>
            <Icon name="chevron-forward" size={18} />
          </TouchableOpacity>
          <Text style={styles.detail}>Charged per selected date. Availability is confirmed at checkout.</Text>

          {reviews.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Reviews</Text>
              {reviews.map((r) => (
                <View key={r.id} style={styles.reviewRow}>
                  <Text style={styles.reviewRating}>★ {r.rating}</Text>
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={{ flex: 1 }}><Text style={styles.price}>{spot.pricePerDay ? `$${spot.pricePerDay.toFixed(2)}` : "Unavailable"}</Text><Text style={styles.detail}>CAD / calendar day</Text></View>
        <TouchableOpacity
        style={[styles.bookButton, (!spot.isActive || !supportsDailyBooking(spot)) && { opacity: 0.5 }]}
        disabled={!spot.isActive || !supportsDailyBooking(spot)}
        onPress={() => navigation.navigate("BookSpot", { ...route.params })}
      >
        <Text style={styles.bookButtonText}>{spot.isActive && supportsDailyBooking(spot) ? "Reserve" : "Unavailable"}</Text>
      </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  photo: { aspectRatio: 1.3 },
  photoPlaceholder: { justifyContent: "center", alignItems: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg },
  title: { ...ui.heading },
  address: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: spacing.md, gap: spacing.sm },
  price: { fontSize: 20, fontWeight: "700", color: colors.primary },
  priceSecondary: { fontSize: 14, color: colors.textMuted },
  rating: { marginTop: spacing.xs, color: colors.accent, fontWeight: "600" },
  sectionTitle: { ...ui.subheading, marginTop: spacing.lg },
  description: { ...ui.body, marginTop: spacing.sm },
  detail: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  facts: { gap: spacing.md, marginTop: spacing.lg, paddingVertical: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  fact: { ...ui.row },
  dateRow: { ...ui.row, paddingVertical: spacing.lg, gap: spacing.md },
  footer: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.md, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  reviewRow: {
    marginTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewRating: { color: colors.accent, fontWeight: "600" },
  reviewComment: { color: colors.text, marginTop: 2 },
  bookButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  bookButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
