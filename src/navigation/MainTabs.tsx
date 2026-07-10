import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import SearchStack from "./SearchStack";
import MyListingsStack from "./MyListingsStack";
import BookingsStack from "./BookingsStack";
import ProfileStack from "./ProfileStack";
import type { MainTabsParamList } from "./types";
import { colors } from "../constants/theme";

const Tab = createBottomTabNavigator<MainTabsParamList>();

const TAB_ICONS: Record<keyof MainTabsParamList, string> = {
  SearchTab: "📍",
  MyListingsTab: "🅿️",
  BookingsTab: "🗓️",
  ProfileTab: "👤",
};

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: () => <Text>{TAB_ICONS[route.name as keyof MainTabsParamList]}</Text>,
      })}
    >
      <Tab.Screen name="SearchTab" component={SearchStack} options={{ title: "Search" }} />
      <Tab.Screen name="MyListingsTab" component={MyListingsStack} options={{ title: "My Listings" }} />
      <Tab.Screen name="BookingsTab" component={BookingsStack} options={{ title: "Bookings" }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}
