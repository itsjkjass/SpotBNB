import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { colors, radius, spacing } from "../../constants/theme";

export const TOUR_KEY = "spotbnb:intro-tour:v1";
const steps = [
  { number: "01", title: "Find your next parking spot", text: "Explore nearby spaces, compare prices and read the details. You can browse freely and create an account when you are ready to book." },
  { number: "02", title: "Have a space to share?", text: "Publish your space in My Listings and receive bookings. You can finish Stripe payout setup later, before withdrawing earnings after a booking ends." },
  { number: "03", title: "Keep every booking together", text: "Manage reservations in Bookings and message the other person after payment confirms the booking. Find optional document checks in Profile and revisit this tour in Help." },
];

export default function TutorialScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Tutorial">) {
  const [step, setStep] = useState(0);
  useEffect(() => navigation.addListener("beforeRemove", () => {
    AsyncStorage.setItem(TOUR_KEY, "seen").catch(() => {});
  }), [navigation]);
  const close = () => { if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate("Main"); };
  const item = steps[step];
  return <SafeAreaView style={styles.container}>
    <TouchableOpacity accessibilityRole="button" onPress={close} style={styles.skip}><Text style={styles.link}>Skip tour</Text></TouchableOpacity>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>SpotBnB</Text><Text style={styles.number}>{item.number}</Text>
      <Text accessibilityRole="header" style={styles.heading}>{item.title}</Text><Text style={styles.body}>{item.text}</Text>
    </ScrollView>
    <View style={styles.footer}>
      <Text accessibilityLiveRegion="polite" style={styles.progress}>Step {step + 1} of {steps.length}</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => step === steps.length - 1 ? close() : setStep(value => value + 1)}><Text style={styles.buttonText}>{step === steps.length - 1 ? "Start exploring" : "Next"}</Text></TouchableOpacity>
      {step > 0 && <TouchableOpacity onPress={() => setStep(value => value - 1)} style={styles.back}><Text style={styles.link}>Back</Text></TouchableOpacity>}
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, skip: { alignSelf: "flex-end", padding: spacing.lg },
  content: { flexGrow: 1, justifyContent: "center", padding: spacing.xl }, brand: { color: colors.primary, fontWeight: "700", fontSize: 18 },
  number: { color: colors.primary, fontWeight: "700", fontSize: 64, marginTop: spacing.xl },
  heading: { fontSize: 30, lineHeight: 38, fontWeight: "700", color: colors.text, marginTop: spacing.md },
  body: { fontSize: 17, lineHeight: 26, color: colors.textMuted, marginTop: spacing.lg },
  footer: { padding: spacing.lg }, progress: { textAlign: "center", color: colors.textMuted, marginBottom: spacing.md },
  button: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, alignItems: "center" },
  buttonText: { color: "white", fontSize: 17, fontWeight: "600" }, link: { color: colors.primary, fontWeight: "600" }, back: { alignItems: "center", padding: spacing.md },
});
