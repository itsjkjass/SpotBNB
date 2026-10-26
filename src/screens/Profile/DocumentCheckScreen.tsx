import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../hooks/useAuth";
import { colors, radius, spacing } from "../../constants/theme";
import { PRIVACY_POLICY_URL } from "../../constants/publicLinks";
import { openPublicLink } from "../../utils/openPublicLink";
import { CONSENT_VERSION, documentReason, getDocumentCheckSettings, removeDocumentCheck, requiredDocuments, submitDocumentCheck, subscribeDocumentCheck, type DocumentCheck, type DocumentImage, type DocumentRole } from "../../services/verification";

export default function DocumentCheckScreen() {
  const [role, setRole] = useState<DocumentRole>("seller");
  return <View style={styles.container}>
    <View style={styles.roles}>{(["seller", "buyer"] as const).map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: role === value }} onPress={() => setRole(value)} style={[styles.role, role === value && styles.selected]}>
      <Text style={role === value ? styles.white : styles.title}>{value === "seller" ? "Seller documents" : "Buyer documents"}</Text>
    </TouchableOpacity>)}</View>
    <RoleDocuments key={role} role={role} />
  </View>;
}

function RoleDocuments({ role }: { role: DocumentRole }) {
  const { user } = useAuth();
  const [images, setImages] = useState<Record<string, DocumentImage & { uri: string }>>({});
  const [status, setStatus] = useState<DocumentCheck | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    let failed = false;
    getDocumentCheckSettings().then(settings => {
      if (active) { setEnabled(!failed && settings.enabled && settings.consentVersion === CONSENT_VERSION); setLoading(false); }
    }).catch(() => { if (active) { setError("Document checks are unavailable. Please try again later."); setLoading(false); } });
    const stop = subscribeDocumentCheck(user.uid, role, value => { if (active) setStatus(value); }, () => {
      if (active) { failed = true; setError("Couldn't load your document status."); setEnabled(false); }
    });
    return () => { active = false; stop(); };
  }, [user, role, attempt]);
  const processing = status?.status === "processing" && now - status.updatedAt < 180_000;
  const checked = status?.status === "checked" && (status.expiresAt ?? 0) > now;
  const pick = async (kind: string, camera: boolean) => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { Alert.alert("Camera access needed", "Allow camera access in your device settings to take your selfie."); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, base64: true, allowsEditing: false, exif: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!mounted.current || result.canceled) return;
      const image = result.assets[0];
      if (!image?.base64 || image.base64.length > 2_796_204) { Alert.alert("Image too large", "Use a JPEG or PNG photo under 2 MB. Try taking a new photo at a lower resolution."); return; }
      const mimeType = image.base64.startsWith("iVBOR") ? "image/png" : "image/jpeg";
      setImages(current => ({ ...current, [kind]: { kind, data: image.base64!, mimeType, uri: image.uri } }));
    } catch { if (mounted.current) Alert.alert("Couldn't open photos", "Please check the app's camera and photo permissions."); }
  };
  const submit = async () => {
    if (!consent || busy || processing || !enabled || requiredDocuments[role].some(item => !images[item.kind])) return;
    setBusy(true); setError(null);
    try {
      await submitDocumentCheck(role, requiredDocuments[role].map(({ kind }) => ({ kind, data: images[kind].data, mimeType: images[kind].mimeType })));
      if (mounted.current) { setImages({}); setConsent(false); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Couldn't check your documents. Please try again."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const remove = () => Alert.alert("Remove document-check result?", "This removes your badge and check result. Documents are not stored in SpotBnB's database. Daily submission limits remain in place.", [
    { text: "Keep result", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => {
      setBusy(true);
      try { await removeDocumentCheck(role); if (mounted.current) { setImages({}); setConsent(false); } }
      catch { if (mounted.current) setError("Couldn't remove your check result. Try again."); }
      finally { if (mounted.current) setBusy(false); }
    } },
  ]);
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.heading}>Get your documents checked</Text>
    <Text style={styles.body}>Optional checks help other people understand what you have submitted. You can keep exploring and using the app without a badge.</Text>
    <View style={styles.notice}>
      <Text style={styles.title}>{checked ? "Documents checked" : processing ? "Checking your documents…" : "Not verified"}</Text>
      {checked && <Text style={styles.body}>Valid until {new Date(status!.expiresAt!).toLocaleDateString()}. This check does not guarantee identity, authenticity, ownership or insurance coverage.</Text>}
      {status?.status === "needs_resubmission" && status.reasons.map(reason => <Text key={reason} style={styles.body}>• {documentReason[reason] ?? documentReason.uncertain}</Text>)}
      {status?.status === "error" && <Text style={styles.body}>The check could not finish. You can try again.</Text>}
      {status?.status === "processing" && !processing && <Text style={styles.body}>This check is taking longer than expected. You can submit again.</Text>}
    </View>
    {loading ? <ActivityIndicator color={colors.primary} /> : !enabled && <Text style={styles.body}>Document checks are being prepared and are not available yet. You can continue using the app.</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!enabled && !loading && <TouchableOpacity onPress={() => { setLoading(true); setError(null); setEnabled(false); setAttempt(value => value + 1); }}><Text style={styles.link}>Refresh availability</Text></TouchableOpacity>}
    {enabled && <>
      <Text style={styles.body}>{role === "seller" ? "Use a current government photo ID, a fresh selfie, and two address proofs from different issuers dated within 90 days. Both proofs must show your full name and the same address." : "Use a current government photo ID, current vehicle insurance, and vehicle registration or ownership proof. Names and vehicle details must match."}</Text>
      <Text style={styles.body}>Photograph the whole document clearly. JPEG or PNG only, up to 2 MB each. Hide unrelated financial transactions, but keep the required name, address, dates and vehicle details visible.</Text>
      {requiredDocuments[role].map(item => <View key={item.kind} style={styles.document}>
        <Text style={styles.title}>{item.label}</Text>
        {images[item.kind] && <Image source={{ uri: images[item.kind].uri }} style={styles.preview} accessibilityLabel={item.label} />}
        <View style={styles.roles}><TouchableOpacity disabled={busy || processing} onPress={() => pick(item.kind, true)}><Text style={styles.link}>{images[item.kind] ? "Retake photo" : "Take photo"}</Text></TouchableOpacity>
          {item.kind !== "selfie" && <TouchableOpacity disabled={busy || processing} onPress={() => pick(item.kind, false)}><Text style={styles.link}>Choose photo</Text></TouchableOpacity>}
        </View>
      </View>)}
      <View style={styles.notice}>
        <Text style={styles.title}>Before you submit</Text>
        <Text style={styles.body}>SpotBnB sends these images to Google Gemini for automated checks of readability, matching details and dates. AI can make mistakes. This is not an official identity check, a selfie liveness test or confirmation from a document issuer.</Text>
        <Text style={styles.body}>SpotBnB processes images for this request without saving them to its database or file storage. We keep your check result, expiry, consent time and submission limits. Google may retain request data temporarily for abuse prevention under its paid-service terms. Other users see only your badge status.</Text>
        <TouchableOpacity accessibilityRole="link" onPress={() => void openPublicLink(PRIVACY_POLICY_URL)}><Text style={styles.link}>Read privacy policy</Text></TouchableOpacity>
        <View style={styles.consent}><Switch value={consent} onValueChange={setConsent} disabled={busy || processing} accessibilityLabel="Agree to automated document checks" /><Text style={styles.consentText}>I am 18 or older, these are my documents, and I agree to send them to Google Gemini for this check.</Text></View>
      </View>
      <TouchableOpacity accessibilityRole="button" disabled={!consent || busy || processing || requiredDocuments[role].some(item => !images[item.kind])} onPress={submit} style={[styles.button, (!consent || busy || processing || requiredDocuments[role].some(item => !images[item.kind])) && styles.disabled]}>
        {busy || processing ? <ActivityIndicator color="white" /> : <Text style={styles.white}>Submit documents</Text>}
      </TouchableOpacity>
    </>}
    {status && status.status !== "not_checked" && <TouchableOpacity disabled={busy} onPress={remove}><Text style={styles.link}>Remove my check result</Text></TouchableOpacity>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.md },
  roles: { flexDirection: "row", gap: spacing.md, padding: spacing.sm }, role: { flex: 1, padding: spacing.md, borderRadius: radius.sm },
  selected: { backgroundColor: colors.primary }, heading: { fontSize: 23, fontWeight: "700", color: colors.text },
  title: { color: colors.text, fontWeight: "600" }, body: { color: colors.textMuted, lineHeight: 22, marginTop: spacing.sm },
  notice: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md },
  document: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
  preview: { width: 120, height: 90, resizeMode: "contain", marginTop: spacing.sm },
  link: { color: colors.primary, paddingVertical: spacing.sm, fontWeight: "600" },
  consent: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.md }, consentText: { flex: 1, color: colors.text, lineHeight: 21 },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  disabled: { opacity: 0.5 }, white: { color: "white", fontWeight: "600" }, error: { color: colors.danger, lineHeight: 22 },
});
