import React, { useState } from "react";
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
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { createSpot, uploadSpotPhoto } from "../../services/spots";
import { useAuth } from "../../hooks/useAuth";
import { colors, spacing, radius } from "../../constants/theme";
import type { MyListingsStackParamList } from "../../navigation/types";
import { SpotType, VehicleSize } from "../../types/models";

type Props = NativeStackScreenProps<MyListingsStackParamList, "CreateListing">;

const SPOT_TYPES: SpotType[] = ["driveway", "garage", "lot", "street", "other"];
const VEHICLE_SIZES: VehicleSize[] = ["compact", "standard", "suv_truck"];

export default function CreateListingScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [pricePerHour, setPricePerHour] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [spotType, setSpotType] = useState<SpotType>("driveway");
  const [vehicleSizes, setVehicleSizes] = useState<VehicleSize[]>(["standard"]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!title || !address || !pricePerHour) {
      setError("Title, address, and hourly price are required.");
      return;
    }
    const hourlyPrice = parseFloat(pricePerHour);
    if (Number.isNaN(hourlyPrice) || hourlyPrice <= 0) {
      setError("Enter a valid hourly price.");
      return;
    }

    let dailyPrice: number | undefined;
    if (pricePerDay) {
      dailyPrice = parseFloat(pricePerDay);
      if (Number.isNaN(dailyPrice) || dailyPrice <= 0) {
        setError("Enter a valid daily price.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const geocoded = await Location.geocodeAsync(address);
      if (geocoded.length === 0) {
        setError("Couldn't find that address. Try being more specific.");
        return;
      }
      const { latitude, longitude } = geocoded[0];

      const photoUrls = await Promise.all(photos.map((uri) => uploadSpotPhoto(user.uid, uri)));

      await createSpot(user.uid, {
        title,
        description,
        address,
        location: { latitude, longitude },
        photoUrls,
        pricePerHour: hourlyPrice,
        pricePerDay: dailyPrice,
        currency: "cad",
        spotType,
        vehicleSizes,
        amenities: [],
        availability: { type: "always" },
      });

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
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Driveway near BMO Field" />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe your spot, access instructions, restrictions..."
        multiline
      />

      <Text style={styles.label}>Address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="123 Main St, Toronto, ON" />

      <Text style={styles.label}>Price per hour (CAD)</Text>
      <TextInput
        style={styles.input}
        value={pricePerHour}
        onChangeText={setPricePerHour}
        placeholder="5.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Price per day (CAD, optional)</Text>
      <TextInput
        style={styles.input}
        value={pricePerDay}
        onChangeText={setPricePerDay}
        placeholder="25.00"
        keyboardType="decimal-pad"
      />

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
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Publish Listing</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: spacing.md },
  input: {
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