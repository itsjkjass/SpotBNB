import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { ParkingCoordinate } from "../utils/parkingLocation";

export type AddressSuggestion = { placeId: string; address: string };
export type ResolvedAddress = AddressSuggestion & { coordinate: ParkingCoordinate; attributions: { provider: string; uri: string }[] };
const search = httpsCallable<Record<string, string>, { suggestions: AddressSuggestion[] } | ResolvedAddress>(functions, "searchAddresses", { timeout: 15000 });
export function newAddressSession() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
export async function suggestAddresses(input: string, sessionToken: string): Promise<AddressSuggestion[]> {
  const result = (await search({ action: "suggest", input, sessionToken })).data;
  return "suggestions" in result ? result.suggestions : [];
}
export async function resolveAddress(placeId: string, sessionToken: string): Promise<ResolvedAddress> {
  const result = (await search({ action: "resolve", placeId, sessionToken })).data;
  if (!("coordinate" in result)) throw new Error("Choose the address again.");
  return result;
}
