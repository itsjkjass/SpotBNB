import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing } from "../constants/theme";
import { AddressSuggestion, newAddressSession, ResolvedAddress, resolveAddress, suggestAddresses } from "../services/addresses";
import { Action, Icon } from "./ui";
import { MotionPressable } from "./Motion";

type Props = { value: string; onChangeText: (value: string) => void; onSelect: (address: ResolvedAddress) => void; placeholder: string; disabled?: boolean };

export default function AddressSearch({ value, onChangeText, onSelect, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [retry, setRetry] = useState(0);
  const session = useRef("");
  const generation = useRef(0);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const version = ++generation.current;
    if (!open || value.trim().length < 3) return;
    const lifecycle = generation;
    const timer = globalThis.setTimeout(() => {
      setLoading(true);
      suggestAddresses(value.trim(), session.current).then(results => {
        if (generation.current === version) { setSuggestions(results); setSearched(true); }
      }).catch(() => {
        if (generation.current === version) setError("Address suggestions are unavailable. Try again, or use the map to choose your location.");
      }).finally(() => { if (generation.current === version) setLoading(false); });
    }, 350);
    return () => { globalThis.clearTimeout(timer); lifecycle.current++; };
  }, [open, value, retry]);
  const close = () => { generation.current++; setOpen(false); setResolving(false); setLoading(false); };
  const retrySearch = () => { setError(""); setSearched(false); setSuggestions([]); setRetry(n => n + 1); };
  const choose = async (suggestion: AddressSuggestion) => {
    if (resolving) return;
    const version = ++generation.current;
    setResolving(true); setLoading(false); setError("");
    try {
      const selected = await resolveAddress(suggestion.placeId, session.current);
      if (generation.current !== version) return;
      close(); onSelect(selected);
    } catch {
      if (generation.current === version) {
        // Details ends the autocomplete session, including failed attempts.
        session.current = newAddressSession();
        setResolving(false); setError("Couldn't locate this address. Try again or place the pin yourself.");
      }
    }
  };
  return <>
    <MotionPressable accessibilityRole="button" accessibilityLabel={value ? `Change address: ${value}` : placeholder} disabled={disabled}
      style={styles.launch} onPress={() => { session.current = newAddressSession(); setError(""); setSuggestions([]); setSearched(false); setOpen(true); }}>
      <Icon name="search-outline" color={colors.primary} /><Text style={[styles.value, !value && styles.muted]}>{value || placeholder}</Text>
      <Icon name="chevron-forward" color={colors.primary} />
    </MotionPressable>
    {open && <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.screen, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}><Text style={styles.title}>Find an address</Text><MotionPressable accessibilityRole="button" accessibilityLabel="Close address search" style={styles.close} onPress={close}><Icon name="close" color={colors.primary} /></MotionPressable></View>
        <TextInput autoFocus accessibilityLabel="Search Canadian addresses" value={value} editable={!resolving}
          onChangeText={text => { generation.current++; setSuggestions([]); setSearched(false); setLoading(false); setError(""); onChangeText(text); }}
          placeholder={placeholder} placeholderTextColor={colors.textMuted} selectionColor={colors.primary}
          style={styles.input} autoCorrect={false} returnKeyType="search" onSubmitEditing={() => { if (!resolving) retrySearch(); }} />
        <Text style={styles.hint}>Enter the street number, street and city. Choose the matching address below.</Text>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
          {(loading || resolving) && <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text style={styles.hint}>{resolving ? "Locating the selected address…" : "Finding addresses…"}</Text></View>}
          {suggestions.map(suggestion => <MotionPressable key={suggestion.placeId} disabled={resolving} accessibilityRole="button" accessibilityLabel={suggestion.address}
            onPress={() => choose(suggestion)} style={styles.result}><Icon name="location-outline" color={colors.primary} /><Text style={styles.value}>{suggestion.address}</Text></MotionPressable>)}
          {!loading && searched && !suggestions.length && !error && <Text style={styles.hint}>No matches yet. Add the city or postal code, or place the pin on the map.</Text>}
          {error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Action secondary label="Try again" onPress={retrySearch} /></> : null}
          <Text style={styles.attribution}>Google Maps</Text>
        </ScrollView>
        <Action secondary label="Keep typed address" disabled={!value.trim() || resolving} onPress={close} />
        <Text style={styles.terms}>Address searches are sent to Google. <Text accessibilityRole="link" onPress={() => void Linking.openURL("https://policies.google.com/privacy").catch(() => {})}>Privacy policy</Text> · <Text accessibilityRole="link" onPress={() => void Linking.openURL("https://maps.google.com/help/terms_maps/").catch(() => {})}>Terms</Text></Text>
      </KeyboardAvoidingView>
    </Modal>}
  </>;
}

const styles = StyleSheet.create({
  launch: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, padding: spacing.md, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.xs },
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }, title: { fontSize: 24, fontWeight: "700", color: colors.text },
  close: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  input: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, padding: spacing.md, color: colors.text, fontSize: 16, backgroundColor: colors.paper },
  value: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 23 }, muted: { color: colors.textMuted },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginVertical: 10 }, results: { paddingBottom: 16 },
  result: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  status: { flexDirection: "row", alignItems: "center", gap: 10 }, error: { color: colors.danger, marginVertical: 12 },
  attribution: { color: colors.textMuted, fontSize: 13, fontWeight: "500", alignSelf: "flex-end", marginVertical: 16 },
  terms: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 12 },
});
