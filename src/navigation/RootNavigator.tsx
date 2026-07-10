import React from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import { usePushNotifications } from "../hooks/usePushNotifications";
import AuthStack from "./AuthStack";
import MainTabs from "./MainTabs";
import { colors } from "../constants/theme";

function AuthedApp() {
  usePushNotifications();
  return <MainTabs />;
}

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <NavigationContainer>{user ? <AuthedApp /> : <AuthStack />}</NavigationContainer>;
}
