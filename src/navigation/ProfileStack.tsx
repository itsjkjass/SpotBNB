import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ProfileScreen from "../screens/Profile/ProfileScreen";
import SellerOnboardingScreen from "../screens/Profile/SellerOnboardingScreen";
import type { ProfileStackParamList } from "./types";
import { colors } from "../constants/theme";

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
      <Stack.Screen
        name="SellerOnboarding"
        component={SellerOnboardingScreen}
        options={{ title: "Seller Payouts" }}
      />
    </Stack.Navigator>
  );
}
