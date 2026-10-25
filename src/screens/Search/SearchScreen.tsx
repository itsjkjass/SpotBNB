import { Reveal } from "../../components/Motion";
import { useScreenGuide } from "../../components/ScreenGuide";
import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, ScrollView, Keyboard, Platform, Linking } from "react-native";
import MapView, { Marker, Region, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getActiveSpots } from "../../services/spots";
import { ParkingSpot, VehicleSize } from "../../types/models";
import { colors, depth, spacing, radius } from "../../constants/theme";
import type { SearchStackParamList } from "../../navigation/types";
import { dateInZone, DEFAULT_PARKING_TIME_ZONE, supportsDailyBooking } from "../../utils/calendarDays";
import BookingCalendar from "../../components/BookingCalendar";
import SpotCard from "../../components/SpotCard";
import { Choice, EmptyState, ui } from "../../components/ui";
import AddressSearch from "../../components/AddressSearch";
import type { ResolvedAddress } from "../../services/addresses";

type Props = NativeStackScreenProps<SearchStackParamList, "SearchMap">;
const DEFAULT_REGION: Region = { latitude: 43.6532, longitude: -79.3832, latitudeDelta: 0.1, longitudeDelta: 0.1 };

export default function SearchScreen({ navigation }: Props) {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const { firstTarget: guideFirstTarget, secondTarget: guideSecondTarget, overlay: guideOverlay } = useScreenGuide("explore", !loading);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listMode, setListMode] = useState(false);
  const [destination, setDestination] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<ResolvedAddress | null>(null);
  const [searching, setSearching] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [vehicle, setVehicle] = useState<VehicleSize | null>(null);
  const [garage, setGarage] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [today] = useState(() => dateInZone(Date.now(), DEFAULT_PARKING_TIME_ZONE));
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [datesChosen, setDatesChosen] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    getActiveSpots().then(data => {
      if (active) { setSpots(data.filter(supportsDailyBooking)); setError(null); }
    }).catch(() => { if (active) setError("Couldn't load spaces. Check your connection and try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []));

  const retry = async () => {
    setLoading(true);
    try { setSpots((await getActiveSpots()).filter(supportsDailyBooking)); setError(null); }
    catch { setError("Couldn't load spaces. Check your connection and try again."); }
    finally { setLoading(false); }
  };
  const findDestination = async (nearMe = false) => {
    if (searching || (!nearMe && !destination.trim())) return;
    Keyboard.dismiss(); setSearching(true); setLocationError("");
    try {
      let point: { latitude: number; longitude: number };
      if (nearMe || Platform.OS === "android") {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Allow location access to search places on this device. You can still browse by moving the map.");
        setLocationAllowed(true);
      }
      if (nearMe) {
        point = (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords;
      } else {
        const results = await Location.geocodeAsync(destination.trim());
        if (!results[0]) throw new Error("We couldn't find that place. Try a city and street name.");
        point = results[0];
      }
      setRegion({ latitude: point.latitude, longitude: point.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 });
      setSelectedDestination(null);
      setSelectedId(null);
    } catch (e) { setLocationError((e as Error).message || "Location search is unavailable. You can still move the map."); }
    finally { setSearching(false); }
  };
  const filtered = spots.filter(spot => (!vehicle || spot.vehicleSizes.includes(vehicle)) && (!garage || spot.spotType === "garage"));
  const nearby = filtered.filter(spot => Math.abs(spot.location.latitude - region.latitude) <= region.latitudeDelta / 2 && Math.abs(spot.location.longitude - region.longitude) <= region.longitudeDelta / 2);
  const selected = nearby.find(spot => spot.id === selectedId) ?? nearby[0];
  const openSpot = (spot: ParkingSpot) => navigation.navigate("SpotDetail", {
    spotId: spot.id, ...(datesChosen ? { startDate, endDate } : {}),
  });

  return <View style={styles.container}>
    <ScrollView style={styles.topScroll} contentContainerStyle={styles.top} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={ui.heading}>Park for the day.</Text>
      <Text style={ui.body}>A space near where you need to be.</Text>
      <View ref={guideFirstTarget} collapsable={false}>
        <AddressSearch value={destination} disabled={searching} placeholder="Where are you headed?" onChangeText={value => { setDestination(value); setSelectedDestination(null); }}
          onSelect={selected => {
            setDestination(selected.address); setSelectedDestination(selected); setLocationError(""); setSelectedId(null);
            setRegion({ ...selected.coordinate, latitudeDelta: 0.008, longitudeDelta: 0.008 });
          }} />
      </View>
      {!!destination.trim() && !selectedDestination && <Choice icon="search-outline" label={searching ? "Finding area…" : "Search typed address"} onPress={() => findDestination()} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
        <Choice icon="calendar-outline" label={datesChosen ? `${startDate.slice(5)} — ${endDate.slice(5)}` : "Choose dates"} selected={datesChosen} onPress={() => { Keyboard.dismiss(); setDatesOpen(true); }} />
        <Choice label="Garage" selected={garage} onPress={() => setGarage(!garage)} />
        <Choice label="SUV / truck" selected={vehicle === "suv_truck"} onPress={() => setVehicle(vehicle ? null : "suv_truck")} />
      </ScrollView>
      {locationError ? <Text accessibilityRole="alert" style={styles.error}>{locationError}</Text> : null}
    </ScrollView>
    <View style={[styles.results, !listMode && styles.mapFrame]}><View style={styles.resultsClip}>
      {listMode ? <FlatList data={nearby} keyExtractor={item => item.id} contentContainerStyle={styles.list}
        refreshing={loading} onRefresh={retry}
        ListHeaderComponent={<Text style={styles.resultsLabel}>{nearby.length} {nearby.length === 1 ? "space" : "spaces"} in this area</Text>}
        ListEmptyComponent={!loading ? <EmptyState title={error ? "Let's try that again" : "No spaces here yet"}
          body={error || "Move the map to another area or clear your filters."} action={error ? "Try again" : "Show map"} onPress={error ? retry : () => setListMode(false)} /> : null}
        renderItem={({ item }) => <SpotCard spot={item} onPress={() => openSpot(item)} />} /> : <>
        <MapView provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFill} region={region} onRegionChangeComplete={setRegion} showsUserLocation={locationAllowed}>
          {selectedDestination && <Marker coordinate={selectedDestination.coordinate} title="Your destination" description={selectedDestination.address} pinColor={colors.primary} />}
          {filtered.map(spot => <Marker key={spot.id} coordinate={spot.location} onPress={() => setSelectedId(spot.id)}
            accessibilityLabel={`${spot.title}, ${spot.pricePerDay} dollars per day`}>
            <View style={[styles.marker, selected?.id === spot.id && styles.markerSelected]}><Text style={[styles.markerText, selected?.id === spot.id && { color: colors.paper }]}>${spot.pricePerDay?.toFixed(2)}</Text></View>
          </Marker>)}
        </MapView>
        {!!selectedDestination?.attributions.length && <View style={styles.attributions}>{selectedDestination.attributions.map(item => <Text key={item.uri} style={styles.note} accessibilityRole="link"
          onPress={() => { if (item.uri.startsWith("https://")) void Linking.openURL(item.uri).catch(() => {}); }}>{item.provider}</Text>)}</View>}
        <View style={styles.mapTools}>
          <Choice icon="locate-outline" label="Near me" onPress={() => findDestination(true)} />
          {loading && <ActivityIndicator color={colors.primary} />}
        </View>
        {selected && !error && <Reveal key={selected.id} style={styles.preview}><SpotCard compact spot={selected} onPress={() => openSpot(selected)} /></Reveal>}
        {(error || (!loading && nearby.length === 0)) && <View style={styles.banner}>
          <Text style={styles.note}>{error || "No spaces in this area. Move the map or clear your filters."}</Text>
          {error && <Choice label="Try again" onPress={retry} />}
        </View>}
      </>}
      <View ref={guideSecondTarget} collapsable={false} style={styles.switcher}><Choice icon={listMode ? "map-outline" : "list-outline"} label={listMode ? "Map" : "List"} selected onPress={() => setListMode(!listMode)} /></View>
    </View>
    </View>
    {guideOverlay}
    {datesOpen && <BookingCalendar startDate={startDate} endDate={endDate} minimumDate={today} onClose={() => setDatesOpen(false)}
      onConfirm={(first, last) => { setStartDate(first); setEndDate(last); setDatesChosen(true); setDatesOpen(false); }} />}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, topScroll: { flexGrow: 0, maxHeight: "60%" }, top: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 10 },
  attributions: { position: "absolute", bottom: 0, right: 0, backgroundColor: colors.paper, padding: 4 },
  choices: { gap: 8 },
  note: { color: colors.textMuted, fontSize: 14, lineHeight: 20 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  results: { flex: 1, minHeight: 180 }, mapFrame: { ...depth.raised, marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primarySoft }, resultsClip: { flex: 1, borderRadius: radius.lg, overflow: "hidden" }, list: { padding: spacing.lg, paddingBottom: 80 }, resultsLabel: { ...ui.label, marginBottom: spacing.md },
  mapTools: { position: "absolute", top: 16, left: 20, flexDirection: "row", gap: 12, alignItems: "center" },
  marker: { backgroundColor: colors.paper, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  markerSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, markerText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  preview: { position: "absolute", left: 16, right: 16, bottom: 70 }, banner: { position: "absolute", left: 20, right: 20, bottom: 78, padding: spacing.md, backgroundColor: colors.paper, borderRadius: radius.md, gap: 8 },
  switcher: { position: "absolute", bottom: 14, alignSelf: "center" },
});
