import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { logOut } from "../../services/auth";
import { colors, spacing, radius } from "../../constants/theme";
import type { ProfileStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<ProfileStackParamList, "Profile">;

export default function ProfileScreen({ navigation }: Props) {
  const { user, profile } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{profile?.displayName ?? user?.email}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <TouchableOpacity style={styles.row} onPress={() => navigation.navigate("SellerOnboarding")}>
        <Text style={styles.rowLabel}>Seller payouts</Text>
        <Text style={styles.rowValue}>
          {profile?.stripeConnectOnboarded ? "Set up" : "Not set up"} →
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logOut}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  name: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: spacing.lg },
  email: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  rowLabel: { color: colors.text, fontWeight: "600" },
  rowValue: { color: colors.textMuted },
  logoutButton: {
    marginTop: spacing.xl,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: { color: colors.danger, fontWeight: "700" },
});
