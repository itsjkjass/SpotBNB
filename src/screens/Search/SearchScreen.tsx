import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getActiveSpots } from "../../services/spots";
import { ParkingSpot } from "../../types/models";
import { colors, spacing, radius } from "../../constants/theme";
import type { SearchStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<SearchStackParamList, "SearchMap">;

const DEFAULT_REGION: Region = {
  latitude: 43.6532,
  longitude: -79.3832,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export default function SearchScreen({ navigation }: Props) {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setRegion({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          });
        }
      } catch (error) {
         
        console.warn("Failed to get current location:", error);
      }
    })();
  }, []);

  const loadSpots = useCallback(async () => {
    setLoading(true);
    try {
      const activeSpots = await getActiveSpots();
      setSpots(activeSpots);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSpots();
    }, [loadSpots])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView style={StyleSheet.absoluteFill} region={region} showsUserLocation>
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={spot.location}
            pinColor={colors.primary}
            onPress={() => setSelectedSpot(spot)}
          />
        ))}
      </MapView>

      {selectedSpot && (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("SpotDetail", { spotId: selectedSpot.id })}
        >
          <Text style={styles.cardTitle}>{selectedSpot.title}</Text>
          <Text style={styles.cardAddress}>{selectedSpot.address}</Text>
          <Text style={styles.cardPrice}>{selectedSpot.pricePerHour.toFixed(2)} CAD/hr</Text>
        </TouchableOpacity>
      )}

      {spots.length === 0 && (
        <View style={styles.emptyBanner}>
          <Text style={styles.emptyText}>No parking spots listed yet nearby.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    position: "absolute",
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  cardAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  cardPrice: { fontSize: 14, fontWeight: "600", color: colors.primary, marginTop: spacing.xs },
  emptyBanner: {
    position: "absolute",
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    alignItems: "center",
  },
  emptyText: { color: colors.textMuted },
});