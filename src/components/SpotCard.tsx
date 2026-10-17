import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ParkingSpot } from "../types/models";
import { colors, radius, spacing } from "../constants/theme";
import { Icon } from "./ui";

export default function SpotCard({ spot, onPress, compact = false }: { spot: ParkingSpot; onPress: () => void; compact?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, compact && styles.compact, pressed && { opacity: 0.8 }]}>
    {spot.photoUrls[0] ? <Image accessibilityLabel={spot.title} source={{ uri: spot.photoUrls[0] }} style={[styles.photo, compact && styles.thumb]} /> :
      <View style={[styles.photo, styles.placeholder, compact && styles.thumb]}><Icon name="car-outline" size={32} color={colors.primary} /></View>}
    <View style={styles.content}>
      <Text numberOfLines={2} style={styles.title}>{spot.title}</Text>
      <Text numberOfLines={2} style={styles.address}>{spot.address}</Text>
      <View style={styles.bottom}>
        <Text style={styles.price}>${spot.pricePerDay?.toFixed(2)} <Text style={styles.unit}>CAD / day</Text></Text>
        {spot.reviewCount > 0 && <Text style={styles.rating}>★ {spot.averageRating.toFixed(1)}</Text>}
      </View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderRadius: radius.lg, overflow: "hidden", marginBottom: spacing.md },
  compact: { flexDirection: "row", alignItems: "center", marginBottom: 0 },
  photo: { width: "100%", aspectRatio: 1.8, backgroundColor: colors.primarySoft }, thumb: { width: 94, height: 112, aspectRatio: undefined, marginLeft: 12, borderRadius: radius.md },
  placeholder: { justifyContent: "center", alignItems: "center" }, content: { flex: 1, padding: spacing.md, gap: 6 },
  title: { color: colors.text, fontWeight: "600", fontSize: 18, lineHeight: 24 }, address: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  bottom: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  price: { color: colors.text, fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] }, unit: { fontSize: 13, fontWeight: "400", color: colors.textMuted }, rating: { color: colors.text, fontSize: 14 },
});
