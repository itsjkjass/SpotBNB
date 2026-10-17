import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import SellerOnboardingScreen from "../screens/Profile/SellerOnboardingScreen";
import DocumentCheckScreen from "../screens/Profile/DocumentCheckScreen";
import EarningsScreen from "../screens/Profile/EarningsScreen";
import type { ProfileStackParamList } from "./types";
import { colors } from "../constants/theme";

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false, headerTitleStyle: { fontSize: 18, fontWeight: "600" }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ title: "Earnings" }} />
      <Stack.Screen name="DocumentCheck" component={DocumentCheckScreen} options={{ title: "Document checks" }} />
      <Stack.Screen
        name="SellerOnboarding"
        component={SellerOnboardingScreen}
        options={{ title: "Seller Payouts" }}
      />
    </Stack.Navigator>
  );
}
