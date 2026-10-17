import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SearchScreen from "../screens/Search/SearchScreen";
import SpotDetailScreen from "../screens/SpotDetail/SpotDetailScreen";
import BookSpotScreen from "../screens/SpotDetail/BookSpotScreen";
import type { RootStackParamList, SearchStackParamList } from "./types";
import { colors } from "../constants/theme";
import RequireAccount from "../components/RequireAccount";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator<SearchStackParamList>();

function AccountBookSpot(props: NativeStackScreenProps<SearchStackParamList, "BookSpot">) {
  return <RequireAccount message="Log in to reserve this parking spot. Your selection will be waiting here."><BookSpotScreen {...props} /></RequireAccount>;
}

export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false, headerTitleStyle: { fontSize: 18, fontWeight: "600" }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="SearchMap" component={SearchScreen} options={({ navigation }) => ({ title: "SpotBnB", headerRight: () => <TouchableOpacity accessibilityRole="button" onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>("Root")?.navigate("Help")}><Text style={{ color: colors.primary, padding: 8 }}>Help</Text></TouchableOpacity> })} />
      <Stack.Screen name="SpotDetail" component={SpotDetailScreen} options={{ title: "Parking space" }} />
      <Stack.Screen name="BookSpot" component={AccountBookSpot} options={{ title: "Your reservation" }} />
    </Stack.Navigator>
  );
}
