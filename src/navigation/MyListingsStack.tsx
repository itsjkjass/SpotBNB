import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MyListingsScreen from "../screens/MyListings/MyListingsScreen";
import CreateListingScreen from "../screens/CreateListing/CreateListingScreen";
import SellerOnboardingScreen from "../screens/Profile/SellerOnboardingScreen";
import type { MyListingsStackParamList } from "./types";
import { colors } from "../constants/theme";

const Stack = createNativeStackNavigator<MyListingsStackParamList>();

export default function MyListingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false, headerTitleStyle: { fontSize: 18, fontWeight: "600" }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ title: "Host" }} />
      <Stack.Screen name="SellerOnboarding" component={SellerOnboardingScreen} options={{ title: "Seller Payouts" }} />
      <Stack.Screen
        name="CreateListing"
        component={CreateListingScreen}
        options={({ route }) => ({ title: route.params?.spotId ? "Edit your space" : "Add your space" })}
      />
    </Stack.Navigator>
  );
}
