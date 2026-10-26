import { MotionPressable } from "../../components/Motion";
import { useScreenGuide } from "../../components/ScreenGuide";
import React, { useState } from "react";
import { ScrollView, Text, StyleSheet, View, Alert } from "react-native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { logOut } from "../../services/auth";
import { colors, depth, spacing, radius } from "../../constants/theme";
import type { ProfileStackParamList, RootStackParamList } from "../../navigation/types";
import DocumentBadge from "../../components/DocumentBadge";
import { Action, Icon, IconName, ui } from "../../components/ui";

type Props = NativeStackScreenProps<ProfileStackParamList, "Profile">;
function AccountRow({ title, detail, icon, onPress }: { title: string; detail: string; icon: IconName; onPress: () => void }) {
  return <MotionPressable accessibilityRole="button" style={styles.row} onPress={onPress}>
    <View style={styles.icon}><Icon name={icon} color={colors.primary} /></View>
    <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.detail}>{detail}</Text></View>
    <Icon name="chevron-forward" size={18} color={colors.textMuted} />
  </MotionPressable>;
}
export default function ProfileScreen({ navigation }: Props) {
  const { user, profile } = useAuth();
  const { firstTarget: guideFirstTarget, overlay: guideOverlay } = useScreenGuide("profile");
  const [busy, setBusy] = useState(false);
  const name = profile?.displayName || "Your account";
  const root = () => navigation.getParent()?.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const signOut = async () => {
    setBusy(true);
    try { await logOut(); }
    catch { Alert.alert("Couldn't sign out", "Please try again."); }
    finally { setBusy(false); }
  };
  return <><ScrollView contentContainerStyle={styles.container}>
    <View ref={guideFirstTarget} collapsable={false} style={styles.identity}>
      <View style={styles.avatar}><Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text></View>
      <Text accessibilityRole="header" style={ui.heading}>{name}</Text>
      <Text style={ui.body}>{user?.email}</Text>
    </View>
    {user && <View style={styles.badges}><DocumentBadge uid={user.uid} role="seller" /><DocumentBadge uid={user.uid} role="buyer" /></View>}
    <Text style={styles.section}>Your account</Text>
    <AccountRow title="Document checks" detail="Manage optional buyer and seller checks" icon="id-card-outline" onPress={() => navigation.navigate("DocumentCheck")} />
    <AccountRow title="Earnings" detail="View completed bookings and withdrawals" icon="wallet-outline" onPress={() => navigation.navigate("Earnings")} />
    <AccountRow title="Payout setup" detail={profile?.stripeConnectOnboarded ? "Details submitted · check your payout status" : "Set up before withdrawing your earnings"} icon="card-outline" onPress={() => navigation.navigate("SellerOnboarding")} />
    <Text style={styles.section}>Help & information</Text>
    <AccountRow title="Help & support" detail="Booking, payments and common questions" icon="help-circle-outline" onPress={() => root()?.navigate("Help")} />
    <AccountRow title="Privacy policy" detail="How SpotBnB uses your information" icon="document-text-outline" onPress={() => root()?.navigate("Privacy")} />
    <AccountRow title="App guide" detail="Explore the app at your own pace" icon="compass-outline" onPress={() => root()?.navigate("Tutorial")} />
    <AccountRow title="Delete account" detail="Permanently remove your account and personal data" icon="trash-outline" onPress={() => navigation.navigate("DeleteAccount")} />
    <View style={{ marginTop: spacing.lg }}><Action label="Sign out" secondary busy={busy} onPress={signOut} /></View>
  </ScrollView>{guideOverlay}</>;
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, backgroundColor: colors.background },
  identity: { gap: spacing.sm }, avatar: { ...depth.soft, width: 64, height: 64, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  initial: { fontSize: 28, fontWeight: "600", color: colors.primary }, badges: { marginTop: spacing.md },
  section: { ...ui.subheading, marginTop: spacing.xl, marginBottom: spacing.sm },
  row: { ...ui.row, gap: spacing.md, paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.border },
  icon: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: "600" }, detail: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4 },
});
