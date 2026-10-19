import * as Location from "expo-location";
import { Platform } from "react-native";
import { isParkingCoordinate, ParkingCoordinate } from "../utils/parkingLocation";

export async function findParkingAddress(address: string): Promise<ParkingCoordinate> {
  if (Platform.OS === "android") {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error("Address lookup needs location permission on Android. You can still move the map and place the pin yourself.");
  }
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    const results = await Promise.race([
      Location.geocodeAsync(address.trim()),
      new Promise<never>((_, reject) => { timeout = globalThis.setTimeout(() => reject(new Error("Address lookup timed out. Move the map to your space and place the pin, or try the address again.")), 12000); }),
    ]);
    if (!isParkingCoordinate(results[0])) throw new Error("Couldn't locate this address. Move the map and place the pin, or go back and refine the address.");
    return { latitude: results[0].latitude, longitude: results[0].longitude };
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}
