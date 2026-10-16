import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SearchScreen from "../screens/Search/SearchScreen";
import SpotDetailScreen from "../screens/SpotDetail/SpotDetailScreen";
import BookSpotScreen from "../screens/SpotDetail/BookSpotScreen";
import type { SearchStackParamList } from "./types";
import { colors } from "../constants/theme";
import RequireAccount from "../components/RequireAccount";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator<SearchStackParamList>();

function AccountBookSpot(props: NativeStackScreenProps<SearchStackParamList, "BookSpot">) {
  return <RequireAccount message="Log in to reserve this parking spot. Your selection will be waiting here."><BookSpotScreen {...props} /></RequireAccount>;
}

export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      <Stack.Screen name="SearchMap" component={SearchScreen} options={{ title: "SpotBnB" }} />
      <Stack.Screen name="SpotDetail" component={SpotDetailScreen} options={{ title: "Parking Spot" }} />
      <Stack.Screen name="BookSpot" component={AccountBookSpot} options={{ title: "Book Spot" }} />
    </Stack.Navigator>
  );
}
