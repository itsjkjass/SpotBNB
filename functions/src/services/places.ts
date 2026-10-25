import { HttpsError } from "firebase-functions/v2/https";

export type AddressQuery = { action: "suggest" | "resolve"; sessionToken: string; input?: string; placeId?: string };

export function parseAddressQuery(data: Record<string, unknown> | undefined): AddressQuery {
  if (!data || !["suggest", "resolve"].includes(String(data.action)) ||
      typeof data.sessionToken !== "string" || !/^[a-zA-Z0-9_-]{16,36}$/.test(data.sessionToken)) {
    throw new HttpsError("invalid-argument", "Start a new address search and try again.");
  }
  const action = data.action as AddressQuery["action"];
  const field = action === "suggest" ? "input" : "placeId";
  const value = typeof data[field] === "string" ? data[field].trim() : "";
  if (value.length < (action === "suggest" ? 3 : 1) || value.length > 256 ||
      (action === "resolve" && !/^[a-zA-Z0-9_-]+$/.test(value))) {
    throw new HttpsError("invalid-argument", "Enter a street address or choose a suggestion.");
  }
  return { action, sessionToken: data.sessionToken, [field]: value };
}

export async function lookupAddress(query: AddressQuery, key: string, send: typeof fetch = fetch) {
  const suggest = query.action === "suggest";
  const url = suggest ? "https://places.googleapis.com/v1/places:autocomplete"
    : `https://places.googleapis.com/v1/places/${query.placeId}?sessionToken=${query.sessionToken}`;
  try {
    const response = await send(url, {
      method: suggest ? "POST" : "GET", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": suggest ? "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
          : "id,formattedAddress,location,attributions" },
      ...(suggest ? { body: JSON.stringify({ input: query.input, sessionToken: query.sessionToken,
        includedRegionCodes: ["ca"], regionCode: "ca", languageCode: "en" }) } : {}),
    });
    if (!response.ok) throw new Error("Places request failed");
    const result = await response.json() as {
      id?: string; formattedAddress?: string; location?: { latitude: number; longitude: number };
      suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
      attributions?: { provider: string; providerUri: string }[];
    };
    if (suggest) {
      return { suggestions: (result.suggestions ?? []).flatMap((item: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => {
        const prediction = item.placePrediction;
        return prediction?.placeId && prediction.text?.text
          ? [{ placeId: prediction.placeId, address: prediction.text.text }] : [];
      }).slice(0, 5) };
    }
    const point = result.location;
    if (result.id !== query.placeId || !result.formattedAddress || !point ||
        !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
        Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw new Error("Missing address location");
    return { placeId: result.id, address: result.formattedAddress,
      coordinate: { latitude: point.latitude, longitude: point.longitude },
      attributions: (result.attributions ?? []).map((item: { provider: string; providerUri: string }) => ({ provider: item.provider, uri: item.providerUri })) };
  } catch {
    // Never return provider responses, API keys or typed addresses in error logs.
    throw new HttpsError("unavailable", "Address search is temporarily unavailable. Try again, or place the pin yourself.");
  }
}
