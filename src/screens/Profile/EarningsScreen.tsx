import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProfileStackParamList } from "../../navigation/types";
import { useAuth } from "../../hooks/useAuth";
import { getEarningsPage, withdrawEarnings, type EarningsItem, type EarningsCursor } from "../../services/earnings";
import { earningsState } from "../../utils/earnings";
import { colors, radius, spacing } from "../../constants/theme";

type Props = NativeStackScreenProps<ProfileStackParamList, "Earnings">;
export default function EarningsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<EarningsItem[]>([]);
  const [cursor, setCursor] = useState<EarningsCursor>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const focused = useRef(false);
  const loadingRef = useRef(false);
  const withdrawing = useRef(false);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const load = useCallback(async (after?: EarningsCursor) => {
    if (!user || loadingRef.current) return;
    loadingRef.current = true;
    const version = generation.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getEarningsPage(user.uid, after);
      if (!focused.current || version !== generation.current) return;
      setItems(previous => after ? [...previous, ...page.items.filter(item => !previous.some(existing => existing.booking.id === item.booking.id))] : page.items);
      setCursor(page.cursor);
      setNow(Date.now());
    } catch {
      if (focused.current && version === generation.current) setError("Couldn't load earnings. Pull down to refresh or try again.");
    } finally {
      if (version === generation.current) { loadingRef.current = false; setLoading(false); }
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    loadingRef.current = false;
    void load();
    return () => { focused.current = false; generation.current++; };
  }, [load]));

  const withdraw = async (item: EarningsItem) => {
    if (withdrawing.current) return;
    withdrawing.current = true;
    setBusyId(item.booking.id);
    try {
      const result = await withdrawEarnings(item.booking.id);
      if (!focused.current) return;
      setItems(previous => previous.map(row => row.booking.id === item.booking.id ? { ...row, transfer: result } : row));
      if (result.status === "transferred") Alert.alert("Transferred to Stripe", "Your bank payout follows Stripe's payout schedule. This is not confirmation of bank arrival.");
      else if (result.status === "processing") Alert.alert("Withdrawal processing", "Your request is saved. We will check its result automatically. Refresh earnings shortly.");
      else Alert.alert("Earnings on hold", "This payment needs review. Contact the person helping you test SpotBnB.");
    } catch (e) {
      if (focused.current) {
        const code = (e as { code?: string }).code;
        Alert.alert("Withdrawal not completed", code === "functions/failed-precondition" ? (e as Error).message : "We couldn't confirm the result. Refresh earnings before trying again; any saved request will be checked automatically.");
      }
    } finally {
      withdrawing.current = false;
      setBusyId(null);
    }
  };

  return <FlatList
    style={styles.container} contentContainerStyle={styles.content}
    data={items} keyExtractor={item => item.booking.id}
    refreshing={loading} onRefresh={() => load()}
    ListHeaderComponent={<View>
      <Text style={styles.heading}>Your parking earnings</Text>
      <Text style={styles.body}>Withdraw each booking after parking ends. Your share is shown after the platform fee. Set up Stripe payouts before your first withdrawal.</Text>
      <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate("SellerOnboarding")}><Text style={styles.link}>Set up or check payouts →</Text></TouchableOpacity>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {error && <TouchableOpacity disabled={loading} onPress={() => load()}><Text style={styles.link}>Try again</Text></TouchableOpacity>}
    </View>}
    ListEmptyComponent={!loading && !error ? <Text style={styles.body}>Your earnings will appear here when your spaces receive bookings.</Text> : null}
    renderItem={({ item }) => {
      const state = earningsState(item, now);
      const net = item.booking.totalPriceCents - item.booking.platformFeeCents;
      return <View style={styles.card}>
        <Text style={styles.title}>{item.booking.spotTitle}</Text>
        <Text style={styles.body}>{new Date(item.booking.endTime).toLocaleString()}</Text>
        <Text style={styles.amount}>${(net / 100).toFixed(2)} CAD</Text>
        <Text style={styles.body}>{state.label}</Text>
        {state.canWithdraw && <TouchableOpacity accessibilityRole="button" disabled={busyId !== null || loading} style={styles.button} onPress={() => withdraw(item)}>
          {busyId === item.booking.id ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Withdraw earnings</Text>}
        </TouchableOpacity>}
      </View>;
    }}
    ListFooterComponent={cursor ? <TouchableOpacity disabled={loading || busyId !== null} style={styles.linkButton} onPress={() => load(cursor)}><Text style={styles.link}>{loading ? "Loading…" : "Load older bookings"}</Text></TouchableOpacity> : null}
  />;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, paddingBottom: spacing.xl },
  heading: { fontSize: 23, fontWeight: "700", color: colors.text }, title: { fontSize: 17, fontWeight: "600", color: colors.text },
  body: { color: colors.textMuted, lineHeight: 22, marginTop: spacing.sm }, amount: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  card: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderColor: colors.border }, link: { color: colors.primary, fontWeight: "600" }, linkButton: { paddingVertical: spacing.lg },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.sm, alignItems: "center", marginTop: spacing.md },
  buttonText: { color: "white", fontWeight: "700" }, error: { color: colors.danger, marginVertical: spacing.md },
});
