import React from "react";
import * as SplashScreen from "expo-splash-screen";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";
import { useAuth } from "../hooks/useAuth";
import { usePushNotifications } from "../hooks/usePushNotifications";
import AuthStack from "./AuthStack";
import MainTabs from "./MainTabs";
import { colors } from "../constants/theme";
import HelpScreen from "../screens/Support/HelpScreen";
import PrivacyScreen from "../screens/Support/PrivacyScreen";
import TutorialScreen from "../screens/Support/TutorialScreen";

import { GuideProvider } from "../components/ScreenGuide";

import { useReducedMotion } from "../components/Motion";

const Stack = createNativeStackNavigator<RootStackParamList, "Root">();

function AppTabs() {
  usePushNotifications();
  return <MainTabs />;
}

export default function RootNavigator() {
  const { user } = useAuth();
  const reducedMotion = useReducedMotion();
  return (
    <GuideProvider>
    <NavigationContainer onReady={() => {
      SplashScreen.setOptions({ fade: !reducedMotion, duration: reducedMotion ? 0 : 250 });
      void SplashScreen.hideAsync().catch(() => {});
    }}>
      <Stack.Navigator id="Root" screenOptions={{ headerShown: false, animation: reducedMotion ? "none" : "slide_from_bottom" }}>
        <Stack.Screen name="Main" component={AppTabs} />
        <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: true, title: "Help", headerTintColor: colors.primary }} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ headerShown: true, title: "Privacy", headerTintColor: colors.primary }} />
        <Stack.Screen name="Tutorial" component={TutorialScreen} options={{ presentation: "modal" }} />
        {!user && <Stack.Screen name="Auth" component={AuthStack} options={{ presentation: "modal", headerShown: true, title: "Your account", headerTintColor: colors.primary }} />}
      </Stack.Navigator>
    </NavigationContainer>
    </GuideProvider>
  );
}
