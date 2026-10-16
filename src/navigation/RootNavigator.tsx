import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { useAuth } from "../hooks/useAuth";
import { usePushNotifications } from "../hooks/usePushNotifications";
import AuthStack from "./AuthStack";
import MainTabs from "./MainTabs";
import { colors } from "../constants/theme";

const Stack = createNativeStackNavigator<RootStackParamList, "Root">();

function AppTabs() {
  usePushNotifications();
  return <MainTabs />;
}

export default function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator id="Root" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={AppTabs} />
        {!user && <Stack.Screen name="Auth" component={AuthStack} options={{ presentation: "modal", headerShown: true, title: "Your account", headerTintColor: colors.primary }} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
