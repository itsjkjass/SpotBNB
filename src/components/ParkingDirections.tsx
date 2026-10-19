import React, { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { getSpot } from "../services/spots";
import { isParkingCoordinate, ParkingCoordinate, parkingDirectionsUrl } from "../utils/parkingLocation";
import { Action } from "./ui";

export default function ParkingDirections({ coordinate, spotId }: { coordinate?: ParkingCoordinate; spotId?: string }) {
  const [legacyCoordinate, setLegacyCoordinate] = useState<{ spotId: string; point: ParkingCoordinate | null } | null>(null);
  const supplied = isParkingCoordinate(coordinate);
  const loading = !supplied && Boolean(spotId) && legacyCoordinate?.spotId !== spotId;
  useEffect(() => {
    if (supplied || !spotId) return;
    let active = true;
    getSpot(spotId).then(spot => { if (active) setLegacyCoordinate({ spotId, point: isParkingCoordinate(spot?.location) ? spot.location : null }); })
      // An older booking may reference a hidden or deleted listing.
      .catch(() => { if (active) setLegacyCoordinate({ spotId, point: null }); });
    return () => { active = false; };
  }, [supplied, spotId]);
  const destination = supplied ? coordinate : legacyCoordinate?.spotId === spotId ? legacyCoordinate?.point : undefined;
  return <Action label={loading ? "Loading directions…" : "Directions to parking"} secondary disabled={loading} onPress={async () => {
    if (!destination) { Alert.alert("Parking pin unavailable", "Ask the host for the exact entrance in your booking messages."); return; }
    try { await Linking.openURL(parkingDirectionsUrl(destination)); }
    catch { Alert.alert("Couldn't open maps", "Please try again or open your maps app."); }
  }} />;
}
