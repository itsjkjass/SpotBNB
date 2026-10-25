import { createHmac } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "../admin";
import { lookupAddress, parseAddressQuery } from "../services/places";

const placesKey = defineSecret("GOOGLE_PLACES_API_KEY");

export const searchAddresses = onCall({ secrets: [placesKey], maxInstances: 5, timeoutSeconds: 20 }, async request => {
  const query = parseAddressQuery(request.data);
  // Guests can explore too. Bound spend for both guests and signed-in callers;
  // store only keyed caller hashes and counters, never address searches or IPs.
  const caller = request.auth?.uid ?? request.rawRequest.ip;
  if (!caller) throw new HttpsError("unavailable", "Address search is unavailable. Try again later.");
  const hash = createHmac("sha256", placesKey.value()).update(caller).digest("hex");
  const callerRef = db.doc(`addressSearchLimits/${hash}`);
  const totalRef = db.doc("addressSearchLimits/dailyTotal");
  const now = Date.now();
  await db.runTransaction(async tx => {
    const personal = (await tx.get(callerRef)).data();
    const total = (await tx.get(totalRef)).data();
    const minute = Math.floor(now / 60000);
    const day = Math.floor(now / 86400000);
    const count = personal?.minute === minute ? personal.count : 0;
    const daily = total?.day === day ? total.count : 0;
    if (count >= 60 || daily >= 5000) throw new HttpsError("resource-exhausted", "Address search is busy. Try again later, or place the pin yourself.");
    tx.set(callerRef, { minute, count: count + 1, expiresAt: new Date(now + 86400000) });
    tx.set(totalRef, { day, count: daily + 1 });
  });
  return lookupAddress(query, placesKey.value());
});
