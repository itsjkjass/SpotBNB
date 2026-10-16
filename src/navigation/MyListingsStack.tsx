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
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      <Stack.Screen name="MyListings" component={MyListingsScreen} options={{ title: "My Listings" }} />
      <Stack.Screen name="SellerOnboarding" component={SellerOnboardingScreen} options={{ title: "Seller Payouts" }} />
      <Stack.Screen
        name="CreateListing"
        component={CreateListingScreen}
        options={{ title: "New Listing" }}
      />
    </Stack.Navigator>
  );
}
