import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getSpot } from "../../services/spots";
import { getReviewsForSpot } from "../../services/reviews";
import { ParkingSpot, Review } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { SearchStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SearchStackParamList, "SpotDetail">;

export default function SpotDetailScreen({ route, navigation }: Props) {
  const { spotId } = route.params;
  const [spot, setSpot] = useState<ParkingSpot | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [spotData, reviewData] = await Promise.all([getSpot(spotId), getReviewsForSpot(spotId)]);
      setSpot(spotData);
      setReviews(reviewData);
      setLoading(false);
    })();
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
        <Text>This listing is no longer available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        {spot.photoUrls.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {spot.photoUrls.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.photo} />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={{ color: colors.textMuted }}>No photos yet</Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.title}>{spot.title}</Text>
          <Text style={styles.address}>{spot.address}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>${spot.pricePerHour.toFixed(2)} CAD/hr</Text>
            {spot.pricePerDay && (
              <Text style={styles.priceSecondary}>${spot.pricePerDay.toFixed(2)} CAD/day</Text>
            )}
          </View>

          {spot.reviewCount > 0 && (
            <Text style={styles.rating}>
              ★ {spot.averageRating.toFixed(1)} ({spot.reviewCount} reviews)
            </Text>
          )}

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{spot.description}</Text>

          <Text style={styles.sectionTitle}>Details</Text>
          <Text style={styles.detail}>Type: {spot.spotType}</Text>
          <Text style={styles.detail}>Vehicle sizes: {spot.vehicleSizes.join(", ")}</Text>
          {spot.amenities.length > 0 && (
            <Text style={styles.detail}>Amenities: {spot.amenities.join(", ")}</Text>
          )}

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

      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => navigation.navigate("BookSpot", { spotId: spot.id })}
      >
        <Text style={styles.bookButtonText}>Book this spot</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  photo: { width: 400, height: 240 },
  photoPlaceholder: { justifyContent: "center", alignItems: "center", backgroundColor: colors.surface },
  content: { padding: spacing.lg },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  address: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: spacing.md, gap: spacing.sm },
  price: { fontSize: 20, fontWeight: "700", color: colors.primary },
  priceSecondary: { fontSize: 14, color: colors.textMuted },
  rating: { marginTop: spacing.xs, color: colors.accent, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: spacing.lg, color: colors.text },
  description: { marginTop: spacing.xs, color: colors.text, lineHeight: 20 },
  detail: { marginTop: spacing.xs, color: colors.text },
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
    margin: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  bookButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
