import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Icon, IconName } from "../components/ui";
import SearchStack from "./SearchStack";
import MyListingsStack from "./MyListingsStack";
import BookingsStack from "./BookingsStack";
import ProfileStack from "./ProfileStack";
import MessagesStack from "./MessagesStack";
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
function AccountMessages() {
  return <RequireAccount message="Log in to talk with buyers and sellers about your confirmed bookings."><MessagesStack /></RequireAccount>;
}

const TAB_ICONS: Record<keyof MainTabsParamList, IconName> = {
  SearchTab: "search-outline",
  MyListingsTab: "home-outline",
  BookingsTab: "calendar-outline",
  ProfileTab: "person-circle-outline",
  MessagesTab: "chatbubble-ellipses-outline",
};

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => <Icon name={TAB_ICONS[route.name]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="SearchTab" component={SearchStack} options={{ title: "Explore" }} />
      <Tab.Screen name="BookingsTab" component={AccountBookings} options={{ title: "Bookings" }} />
      <Tab.Screen name="MyListingsTab" component={AccountListings} options={{ title: "Host" }} />
      <Tab.Screen name="MessagesTab" component={AccountMessages} options={{ title: "Messages" }} />
      <Tab.Screen name="ProfileTab" component={AccountProfile} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}
