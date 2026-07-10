import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BookingsListScreen from "../screens/Bookings/BookingsListScreen";
import BookingDetailScreen from "../screens/Bookings/BookingDetailScreen";
import type { BookingsStackParamList } from "./types";
import { colors } from "../constants/theme";

const Stack = createNativeStackNavigator<BookingsStackParamList>();

export default function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
      <Stack.Screen name="BookingsList" component={BookingsListScreen} options={{ title: "Bookings" }} />
      <Stack.Screen
        name="BookingDetail"
        component={BookingDetailScreen}
        options={{ title: "Booking Details" }}
      />
    </Stack.Navigator>
  );
}
