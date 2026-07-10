import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SearchScreen from "../screens/Search/SearchScreen";
import SpotDetailScreen from "../screens/SpotDetail/SpotDetailScreen";
import BookSpotScreen from "../screens/SpotDetail/BookSpotScreen";
import type { SearchStackParamList } from "./types";
import { colors } from "../constants/theme";

const Stack = createNativeStackNavigator<SearchStackParamList>();

export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      <Stack.Screen name="SearchMap" component={SearchScreen} options={{ title: "SpotBnB" }} />
      <Stack.Screen name="SpotDetail" component={SpotDetailScreen} options={{ title: "Parking Spot" }} />
      <Stack.Screen name="BookSpot" component={BookSpotScreen} options={{ title: "Book Spot" }} />
    </Stack.Navigator>
  );
}
