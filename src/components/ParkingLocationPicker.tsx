import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, depth, radius, spacing } from "../constants/theme";
import { findParkingAddress } from "../services/parkingLocation";
import { isParkingCoordinate, ParkingCoordinate } from "../utils/parkingLocation";
import { MotionPressable, useReducedMotion } from "./Motion";
import { Action, Icon } from "./ui";

type Props = { address: string; initialCoordinate?: ParkingCoordinate; onConfirm: (point: ParkingCoordinate) => void; onClose: () => void };
const closeRegion = (point: ParkingCoordinate) => ({ ...point, latitudeDelta: 0.004, longitudeDelta: 0.004 });
const CANADA_REGION = { latitude: 55, longitude: -96, latitudeDelta: 42, longitudeDelta: 65 };

export default function ParkingLocationPicker({ address, initialCoordinate, onConfirm, onClose }: Props) {
  const initial = isParkingCoordinate(initialCoordinate) ? initialCoordinate : null;
  const [pin, setPin] = useState<ParkingCoordinate | null>(initial);
  const [region, setRegion] = useState(initial ? closeRegion(initial) : CANADA_REGION);
  const [locating, setLocating] = useState(!initial);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const changed = useRef(false);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (initial) return;
    let active = true;
    findParkingAddress(address).then(point => {
      // A late address lookup must never replace a pin the host already chose.
      if (active && !changed.current) { setPin(point); setRegion(closeRegion(point)); }
    }).catch(e => { if (active && !changed.current) setError((e as Error).message || "Address lookup is unavailable. Move the map and tap your parking entrance."); })
      .finally(() => { if (active) setLocating(false); });
    return () => { active = false; };
    // This modal is mounted afresh for each address/pin editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const select = (point: ParkingCoordinate) => {
    if (!isParkingCoordinate(point)) return;
    changed.current = true; setPin({ latitude: point.latitude, longitude: point.longitude }); setError("");
  };
  return <Modal visible presentationStyle="fullScreen" animationType={reduced ? "none" : "fade"} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View accessibilityViewIsModal style={[styles.screen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}><Text accessibilityRole="header" style={styles.title}>Pin your parking entrance</Text><Text numberOfLines={2} style={styles.address}>{address}</Text></View>
        <MotionPressable accessibilityRole="button" accessibilityLabel="Cancel pin selection" style={styles.close} onPress={onClose}><Icon name="close" color={colors.primary} /></MotionPressable>
      </View>
      <Text style={styles.hint}>Tap the map or hold and drag the pin to where drivers should arrive.</Text>
      {locating && <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text style={styles.note}>Finding your address…</Text></View>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.mapFrame}><View style={styles.mapClip}>
        <MapView style={StyleSheet.absoluteFill} region={region} onRegionChangeComplete={setRegion} onMapReady={() => setMapReady(true)}
          onPress={event => select(event.nativeEvent.coordinate)} toolbarEnabled={false}>
          {pin && <Marker coordinate={pin} draggable pinColor={colors.primary} title="Parking entrance" stopPropagation
            onDragStart={() => { changed.current = true; setDragging(true); }}
            onDragEnd={event => { select(event.nativeEvent.coordinate); setDragging(false); }} />}
        </MapView>
      </View></View>
      <View style={styles.footer}>
        <Text style={styles.note}>Buyers will see this pin and use it for directions. Check the entrance before confirming.</Text>
        <Action label="Use this pin" disabled={!pin || !mapReady || dragging} onPress={() => { if (pin && mapReady && !dragging) onConfirm(pin); }} />
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  header: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 8 },
  title: { color: colors.text, fontSize: 22, fontWeight: "700" }, address: { color: colors.textMuted, fontSize: 14, marginTop: 5 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hint: { color: colors.text, fontSize: 15, lineHeight: 21, marginBottom: 12 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  note: { color: colors.textMuted, fontSize: 14, lineHeight: 20 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  mapFrame: { flex: 1, minHeight: 120, backgroundColor: colors.primarySoft, borderRadius: radius.lg, ...depth.raised },
  mapClip: { flex: 1, borderRadius: radius.lg, overflow: "hidden" }, footer: { paddingTop: 16, gap: 12 },
});
