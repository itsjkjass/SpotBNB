import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import SearchStack from "./SearchStack";
import MyListingsStack from "./MyListingsStack";
import BookingsStack from "./BookingsStack";
import ProfileStack from "./ProfileStack";
import type { MainTabsParamList } from "./types";
import { colors } from "../constants/theme";
import RequireAccount from "../components/RequireAccount";

const Tab = createBottomTabNavigator<MainTabsParamList>();

function AccountListings() {
  return <RequireAccount message="Create an account to list your parking space. You can set up payouts later."><MyListingsStack /></RequireAccount>;
}
function AccountBookings() {
  return <RequireAccount message="Log in to see your reservations and manage bookings."><BookingsStack /></RequireAccount>;
}
function AccountProfile() {
  return <RequireAccount message="Log in to manage your profile and seller setup."><ProfileStack /></RequireAccount>;
}

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
      <Tab.Screen name="MyListingsTab" component={AccountListings} options={{ title: "My Listings" }} />
      <Tab.Screen name="BookingsTab" component={AccountBookings} options={{ title: "Bookings" }} />
      <Tab.Screen name="ProfileTab" component={AccountProfile} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}
