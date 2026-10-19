export type ParkingCoordinate = { latitude: number; longitude: number };

export function isParkingCoordinate(value: unknown): value is ParkingCoordinate {
  if (!value || typeof value !== "object") return false;
  const { latitude, longitude } = value as ParkingCoordinate;
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function parkingDirectionsUrl(coordinate: ParkingCoordinate): string {
  if (!isParkingCoordinate(coordinate)) throw new Error("The parking location is unavailable.");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${coordinate.latitude},${coordinate.longitude}`)}&travelmode=driving`;
}
