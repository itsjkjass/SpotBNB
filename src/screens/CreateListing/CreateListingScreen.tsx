import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createSpot, getSpot, updateSpot, uploadSpotPhoto } from "../../services/spots";
import { dailyRateCents, DEFAULT_PARKING_TIME_ZONE, PARKING_TIME_ZONES } from "../../utils/calendarDays";
import { useAuth } from "../../hooks/useAuth";
import { colors, spacing, radius } from "../../constants/theme";
import type { MyListingsStackParamList } from "../../navigation/types";
import { ParkingSpot, SpotType, VehicleSize } from "../../types/models";

type Props = NativeStackScreenProps<MyListingsStackParamList, "CreateListing">;

const SPOT_TYPES: SpotType[] = ["driveway", "garage", "lot", "street", "other"];
const VEHICLE_SIZES: VehicleSize[] = ["compact", "standard", "suv_truck"];

export default function CreateListingScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [timeZone, setTimeZone] = useState<string>(DEFAULT_PARKING_TIME_ZONE);
  const [loading, setLoading] = useState(Boolean(route.params?.spotId));
  const [isActive, setIsActive] = useState(true);
  const [original, setOriginal] = useState<ParkingSpot | null>(null);
  const [spotType, setSpotType] = useState<SpotType>("driveway");
  const [vehicleSizes, setVehicleSizes] = useState<VehicleSize[]>(["standard"]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!route.params?.spotId) return;
    let active = true;
    getSpot(route.params.spotId).then(spot => {
      if (!active) return;
      if (!spot || spot.ownerId !== user?.uid) throw new Error("Listing unavailable.");
      setOriginal(spot);
      setTitle(spot.title); setDescription(spot.description); setAddress(spot.address);
      setPricePerDay(spot.pricePerDay == null ? "" : String(spot.pricePerDay));
      setTimeZone(spot.timeZone ?? DEFAULT_PARKING_TIME_ZONE); setSpotType(spot.spotType);
      setVehicleSizes(spot.vehicleSizes); setPhotos(spot.photoUrls); setIsActive(spot.isActive);
      setLoading(false);
    }).catch(() => { if (active) setError("Couldn't load this listing. Go back and try again."); });
    return () => { active = false; };
  }, [route.params?.spotId, user?.uid]);

  const toggleVehicleSize = (size: VehicleSize) => {
    setVehicleSizes((current) =>
      current.includes(size) ? current.filter((v) => v !== size) : [...current, size]
    );
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to add listing photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((current) => [...current, result.assets[0].uri]);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!user) return;
    if (!title.trim() || !address.trim() || !pricePerDay || !vehicleSizes.length) {
      setError("Add a title, address, daily price and at least one vehicle size.");
      return;
    }
    let dailyPrice: number;
    try { dailyPrice = dailyRateCents(Number(pricePerDay)) / 100; }
    catch (e) { setError((e as Error).message); return; }

    setSubmitting(true);
    try {
      if (Platform.OS === "android" && original?.address !== address) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Allow location access to look up your parking address, then try again.");
      }
      const geocoded = original?.address === address ? [original.location] : await Location.geocodeAsync(address);
      if (geocoded.length === 0) {
        setError("Couldn't find that address. Try being more specific.");
        return;
      }
      const { latitude, longitude } = geocoded[0];

      const photoUrls = await Promise.all(photos.map((uri) => uri.startsWith("https://") ? uri : uploadSpotPhoto(user.uid, uri)));

      const data = {
        title,
        description,
        address,
        location: { latitude, longitude },
        photoUrls,
        pricePerDay: dailyPrice,
        timeZone,
        currency: "cad" as const,
        spotType,
        vehicleSizes,
        amenities: original?.amenities ?? [],
        availability: original?.availability ?? { type: "always" as const },
      };
      if (route.params?.spotId) await updateSpot(route.params.spotId, { ...data, isActive });
      else await createSpot(user.uid, data, true);

      navigation.goBack();
    } catch (e: unknown) {
      const message = (e as Error)?.message ?? "Failed to create listing.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? <Text style={styles.error}>{error || "Loading your listing…"}</Text> : <>
      <Text style={styles.draftNotice}>Publish your space to receive bookings. Set up payouts later, before withdrawing your earnings. You can hide your listing at any time in My Listings.</Text>
      <Text style={styles.label}>Title</Text>
      <TextInput placeholderTextColor={colors.textMuted} selectionColor={colors.primary} keyboardAppearance="light" style={styles.input} value={title} onChangeText={setTitle} placeholder="Driveway near BMO Field" />

      <Text style={styles.label}>Description</Text>
      <TextInput placeholderTextColor={colors.textMuted} selectionColor={colors.primary} keyboardAppearance="light"
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe your spot, access instructions, restrictions..."
        multiline
      />

      <Text style={styles.label}>Address</Text>
      <TextInput placeholderTextColor={colors.textMuted} selectionColor={colors.primary} keyboardAppearance="light" style={styles.input} value={address} onChangeText={setAddress} placeholder="123 Main St, Toronto, ON" />

      <Text style={styles.label}>Price per calendar day (CAD)</Text>
      <TextInput placeholderTextColor={colors.textMuted} selectionColor={colors.primary} keyboardAppearance="light"
        style={styles.input}
        value={pricePerDay}
        onChangeText={setPricePerDay}
        placeholder="25.00"
        keyboardType="decimal-pad"
      />
      <Text style={styles.draftNotice}>One price for each selected calendar date, in your space&apos;s local time zone. No hourly charges.</Text>
      {original?.availability.type === "recurring_hours" && <View>
        <Text style={styles.error}>This listing has restricted hours. Full calendar-day bookings require access throughout each booked date.</Text>
        <TouchableOpacity onPress={() => setOriginal({ ...original, availability: { type: "always" } })}>
          <Text style={styles.label}>Confirm this space is available all day</Text>
        </TouchableOpacity>
      </View>}
      <Text style={styles.label}>Parking space time zone</Text>
      <View style={styles.chipRow}>{PARKING_TIME_ZONES.map(([zone, label]) => <TouchableOpacity key={zone} onPress={() => setTimeZone(zone)} style={[styles.chip, timeZone === zone && styles.chipSelected]}><Text style={[styles.chipText, timeZone === zone && styles.chipTextSelected]}>{label}</Text></TouchableOpacity>)}</View>

      <Text style={styles.label}>Spot type</Text>
      <View style={styles.chipRow}>
        {SPOT_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.chip, spotType === type && styles.chipSelected]}
            onPress={() => setSpotType(type)}
          >
            <Text style={[styles.chipText, spotType === type && styles.chipTextSelected]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Vehicle sizes accepted</Text>
      <View style={styles.chipRow}>
        {VEHICLE_SIZES.map((size) => (
          <TouchableOpacity
            key={size}
            style={[styles.chip, vehicleSizes.includes(size) && styles.chipSelected]}
            onPress={() => toggleVehicleSize(size)}
          >
            <Text style={[styles.chipText, vehicleSizes.includes(size) && styles.chipTextSelected]}>
              {size}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Photos</Text>
      <View style={styles.chipRow}>
        {photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.photoThumb} />
        ))}
        <TouchableOpacity style={styles.addPhoto} onPress={pickPhoto}>
          <Text style={{ fontSize: 24, color: colors.primary }}>+</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{route.params?.spotId ? "Save changes" : "Publish listing"}</Text>}
      </TouchableOpacity>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  draftNotice: { color: colors.textMuted, lineHeight: 21, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.sm },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: spacing.md },
  input: {
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextSelected: { color: "#fff" },
  photoThumb: { width: 64, height: 64, borderRadius: radius.sm },
  addPhoto: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
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
