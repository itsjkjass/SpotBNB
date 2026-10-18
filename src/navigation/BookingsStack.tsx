import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BookingsListScreen from "../screens/Bookings/BookingsListScreen";
import BookingDetailScreen from "../screens/Bookings/BookingDetailScreen";
import type { BookingsStackParamList } from "./types";
import { colors } from "../constants/theme";

import { useReducedMotion } from "../components/Motion";

const Stack = createNativeStackNavigator<BookingsStackParamList>();

export default function BookingsStack() {
  const reducedMotion = useReducedMotion();
  return (
    <Stack.Navigator screenOptions={{ animation: reducedMotion ? "none" : "slide_from_right", headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false, headerTitleStyle: { fontSize: 18, fontWeight: "600" }, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="BookingsList" component={BookingsListScreen} options={{ title: "Bookings" }} />
      <Stack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ title: "Booking Details" }}
      />
    </Stack.Navigator>
  );
}
