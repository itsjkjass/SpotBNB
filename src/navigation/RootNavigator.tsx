import React, { useEffect, useState } from "react";
import { NavigationContainer, useNavigationContainerRef } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { useAuth } from "../hooks/useAuth";
import { usePushNotifications } from "../hooks/usePushNotifications";
import AuthStack from "./AuthStack";
import MainTabs from "./MainTabs";
import { colors } from "../constants/theme";
import HelpScreen from "../screens/Support/HelpScreen";
import PrivacyScreen from "../screens/Support/PrivacyScreen";
import TutorialScreen, { TOUR_KEY } from "../screens/Support/TutorialScreen";

const Stack = createNativeStackNavigator<RootStackParamList, "Root">();

function AppTabs() {
  usePushNotifications();
  return <MainTabs />;
}

export default function RootNavigator() {
  const { user } = useAuth();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    AsyncStorage.getItem(TOUR_KEY).then(value => {
      if (active && value !== "seen" && navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === "SearchMap") navigationRef.navigate("Tutorial");
    }).catch(() => { /* Local storage failures must not prevent browsing. */ });
    return () => { active = false; };
  }, [ready, navigationRef]);

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setReady(true)}>
      <Stack.Navigator id="Root" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={AppTabs} />
        <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: true, title: "Help", headerTintColor: colors.primary }} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ headerShown: true, title: "Privacy", headerTintColor: colors.primary }} />
        <Stack.Screen name="Tutorial" component={TutorialScreen} options={{ presentation: "modal" }} />
        {!user && <Stack.Screen name="Auth" component={AuthStack} options={{ presentation: "modal", headerShown: true, title: "Your account", headerTintColor: colors.primary }} />}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
