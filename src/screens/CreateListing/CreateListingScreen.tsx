import { MotionPressable } from "../../components/Motion";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Keyboard,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createSpot, getSpot, updateSpot, uploadSpotPhoto } from "../../services/spots";
import { dailyRateCents, DEFAULT_PARKING_TIME_ZONE, PARKING_TIME_ZONES } from "../../utils/calendarDays";
import { useAuth } from "../../hooks/useAuth";
import { colors, spacing, radius } from "../../constants/theme";
import type { MyListingsStackParamList } from "../../navigation/types";
import { ParkingSpot, SpotType, VehicleSize } from "../../types/models";
import { listingSaveError } from "../../utils/listingPhoto";
import ParkingLocationPicker from "../../components/ParkingLocationPicker";
import AddressSearch from "../../components/AddressSearch";
import type { ResolvedAddress } from "../../services/addresses";
import { isParkingCoordinate, ParkingCoordinate } from "../../utils/parkingLocation";
import { Action, Icon } from "../../components/ui";

type Props = NativeStackScreenProps<MyListingsStackParamList, "CreateListing">;

const SPOT_TYPES: SpotType[] = ["driveway", "garage", "lot", "street", "other"];
const VEHICLE_SIZES: VehicleSize[] = ["compact", "standard", "suv_truck"];

export default function CreateListingScreen({ navigation, route }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [confirmedLocation, setConfirmedLocation] = useState<{ address: string; coordinate: ParkingCoordinate } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<ResolvedAddress | null>(null);
  const [pricePerDay, setPricePerDay] = useState("");
  const [timeZone, setTimeZone] = useState<string>(DEFAULT_PARKING_TIME_ZONE);
  const [loading, setLoading] = useState(Boolean(route.params?.spotId));
  const [isActive, setIsActive] = useState(true);
  const [original, setOriginal] = useState<ParkingSpot | null>(null);
  const [spotType, setSpotType] = useState<SpotType>("driveway");
  const [vehicleSizes, setVehicleSizes] = useState<VehicleSize[]>(["standard"]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoTypes, setPhotoTypes] = useState<Record<string, string | undefined>>({});
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
      setConfirmedLocation(spot.locationConfirmed && isParkingCoordinate(spot.location)
        ? { address: spot.address.trim(), coordinate: spot.location } : null);
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
    try {
      // The system photo picker grants access to the selected image only.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
      if (!result.canceled && result.assets[0]) {
        const photo = result.assets[0];
        if (photo.fileSize != null && photo.fileSize >= 10 * 1024 * 1024) {
          Alert.alert("Photo too large", "Each listing photo must be smaller than 10 MB. Choose a smaller photo.");
          return;
        }
        setPhotos(current => [...current, photo.uri]);
        setPhotoTypes(current => ({ ...current, [photo.uri]: photo.mimeType }));
      }
    } catch {
      Alert.alert("Couldn't open photos", "Please try choosing your photo again.");
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
    if (!confirmedLocation || confirmedLocation.address !== address.trim() || !isParkingCoordinate(confirmedLocation.coordinate)) {
      setError("Confirm the parking entrance on the map before publishing.");
      Keyboard.dismiss(); setPinOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const { latitude, longitude } = confirmedLocation.coordinate;

      const photoUrls = await Promise.all(photos.map((uri) => uri.startsWith("https://") ? uri : uploadSpotPhoto(user.uid, uri, photoTypes[uri])));

      const data = {
        title,
        description,
        address: address.trim(),
        location: { latitude, longitude },
        locationConfirmed: true,
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
      setError(listingSaveError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
      <AddressSearch value={address} disabled={submitting} onChangeText={value => {
        setAddress(value);
        if (value.trim() !== address.trim()) { setConfirmedLocation(null); setSelectedAddress(null); }
      }} onSelect={selected => {
        setAddress(selected.address); setSelectedAddress(selected); setConfirmedLocation(null); setError(null);
      }} placeholder="123 Main St, Toronto, ON" />
      <View style={styles.pinCard}>
        <View style={styles.pinTitle}><Icon name="location-outline" color={colors.primary} /><Text style={styles.pinLabel}>{confirmedLocation ? "Parking pin confirmed" : "Where should drivers arrive?"}</Text></View>
        <Text style={styles.pinHint}>{selectedAddress ? "Address found. Check the pin at your parking entrance before publishing." : "Choose a matching address above, then confirm the pin at your parking entrance."}</Text>
        <Action secondary label={confirmedLocation ? "Adjust parking pin" : "Set parking pin"} disabled={submitting} onPress={() => {
          if (!address.trim()) { setError("Enter your parking address first."); return; }
          Keyboard.dismiss(); setPinOpen(true);
        }} />
      </View>

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
        <MotionPressable onPress={() => setOriginal({ ...original, availability: { type: "always" } })}>
          <Text style={styles.label}>Confirm this space is available all day</Text>
        </MotionPressable>
      </View>}
      <Text style={styles.label}>Parking space time zone</Text>
      <View style={styles.chipRow}>{PARKING_TIME_ZONES.map(([zone, label]) => <MotionPressable key={zone} onPress={() => setTimeZone(zone)} style={[styles.chip, timeZone === zone && styles.chipSelected]}><Text style={[styles.chipText, timeZone === zone && styles.chipTextSelected]}>{label}</Text></MotionPressable>)}</View>

      <Text style={styles.label}>Spot type</Text>
      <View style={styles.chipRow}>
        {SPOT_TYPES.map((type) => (
          <MotionPressable
            key={type}
            style={[styles.chip, spotType === type && styles.chipSelected]}
            onPress={() => setSpotType(type)}
          >
            <Text style={[styles.chipText, spotType === type && styles.chipTextSelected]}>{type}</Text>
          </MotionPressable>
        ))}
      </View>

      <Text style={styles.label}>Vehicle sizes accepted</Text>
      <View style={styles.chipRow}>
        {VEHICLE_SIZES.map((size) => (
          <MotionPressable
            key={size}
            style={[styles.chip, vehicleSizes.includes(size) && styles.chipSelected]}
            onPress={() => toggleVehicleSize(size)}
          >
            <Text style={[styles.chipText, vehicleSizes.includes(size) && styles.chipTextSelected]}>
              {size}
            </Text>
          </MotionPressable>
        ))}
      </View>

      <Text style={styles.label}>Photos</Text>
      <View style={styles.chipRow}>
        {photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={styles.photoThumb} />
        ))}
        <MotionPressable style={styles.addPhoto} onPress={pickPhoto}>
          <Text style={{ fontSize: 24, color: colors.primary }}>+</Text>
        </MotionPressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <MotionPressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{route.params?.spotId ? "Save changes" : "Publish listing"}</Text>}
      </MotionPressable>
      </>}
    </ScrollView>
    {pinOpen && <ParkingLocationPicker address={address.trim()}
      initialCoordinate={confirmedLocation?.coordinate ?? selectedAddress?.coordinate ?? (original?.address.trim() === address.trim() ? original.location : undefined)}
      attributions={selectedAddress?.attributions}
      onClose={() => setPinOpen(false)} onConfirm={coordinate => {
        setConfirmedLocation({ address: address.trim(), coordinate }); setPinOpen(false); setError(null);
      }} />}
    </>
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
  pinCard: { padding: spacing.md, marginTop: spacing.md, gap: spacing.sm, backgroundColor: colors.paper, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  pinTitle: { flexDirection: "row", alignItems: "center", gap: 8 }, pinLabel: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "600" },
  pinHint: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
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
