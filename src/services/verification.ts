import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

export type DocumentRole = "seller" | "buyer";
export interface DocumentCheck { status: "not_checked" | "processing" | "checked" | "needs_resubmission" | "error"; reasons: string[]; expiresAt: number | null; updatedAt: number }
export interface DocumentBadge { status: "checked" | "not_checked"; expiresAt: number | null }
export interface DocumentImage { kind: string; mimeType: string; data: string }
export const CONSENT_VERSION = "document-check-v1";
export const requiredDocuments = {
  seller: [{ kind: "id", label: "Government photo ID" }, { kind: "selfie", label: "Take a selfie" }, { kind: "address1", label: "First address proof" }, { kind: "address2", label: "Second address proof" }],
  buyer: [{ kind: "id", label: "Government photo ID" }, { kind: "insurance", label: "Vehicle insurance" }, { kind: "ownership", label: "Vehicle registration / ownership" }],
};
export const documentReason: Record<string, string> = {
  uncertain: "The automated check could not reach a clear result. Use clear, original photos of your documents.",
  unreadable: "Some details could not be read. Include the whole document in a well-lit photo.",
  wrong_document: "A photo does not show the requested document type.",
  name_mismatch: "The document holder names could not be matched to the ID.",
  invalid_dates: "An expiry date could not be read.", expired: "A required document has expired.",
  old_address_proof: "Use address proofs issued within the last 90 days with visible dates.",
  address_mismatch: "Both address proofs must show the same full address.",
  duplicate_proof: "Use two different address proofs from different issuers.",
  selfie_mismatch: "The selfie could not be clearly matched to the ID photo.",
  vehicle_mismatch: "The vehicle identifier on the insurance and ownership documents could not be matched.",
};
export function subscribeDocumentCheck(uid: string, role: DocumentRole, next: (value: DocumentCheck | null) => void, fail: () => void) {
  return onSnapshot(doc(db, "documentChecks", uid, "roles", role), snapshot => next(snapshot.exists() ? snapshot.data() as DocumentCheck : null), fail);
}
export function subscribeDocumentBadge(uid: string, role: DocumentRole, next: (value: DocumentBadge | null) => void, fail: () => void) {
  return onSnapshot(doc(db, "documentBadges", uid), snapshot => next(snapshot.data()?.[role] ?? null), fail);
}
export async function getDocumentCheckSettings() {
  return (await httpsCallable<void, { enabled: boolean; consentVersion: string }>(functions, "getDocumentCheckSettings")()).data;
}
export async function submitDocumentCheck(role: DocumentRole, images: DocumentImage[]) {
  return (await httpsCallable(functions, "submitDocumentCheck", { timeout: 130_000 })({ role, images, consentVersion: CONSENT_VERSION })).data;
}
export async function removeDocumentCheck(role: DocumentRole) {
  await httpsCallable(functions, "removeDocumentCheck")({ role });
}
