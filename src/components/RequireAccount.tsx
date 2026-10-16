import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../hooks/useAuth";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius, spacing } from "../constants/theme";

export default function RequireAccount({ children, message }: { children: React.ReactNode; message: string }) {
  const { user, loading } = useAuth();
  const navigation = useNavigation();
  if (loading) return <View style={styles.container}><ActivityIndicator color={colors.primary} /></View>;
  if (user) return <React.Fragment key={user.uid}>{children}</React.Fragment>;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Make yourself at home</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button}
        onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>("Root")?.navigate("Auth")}>
        <Text style={styles.buttonText}>Log in or sign up</Text>
      </TouchableOpacity>
      <Text style={styles.message}>You can keep exploring parking spots in Search.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: "center", backgroundColor: colors.background },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, textAlign: "center" },
  message: { color: colors.textMuted, textAlign: "center", marginVertical: spacing.md, lineHeight: 22 },
  button: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: spacing.md, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
