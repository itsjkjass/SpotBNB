import "react-native-get-random-values";
import React from "react";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { StripeProvider } from "@stripe/stripe-react-native";
import { AuthProvider } from "./src/hooks/useAuth";
import RootNavigator from "./src/navigation/RootNavigator";

import { MotionProvider } from "./src/components/Motion";

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);
  if (!fontsLoaded && !fontError) return null;
  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier={process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID}
      urlScheme="spotbnb"
    >
      <AuthProvider>
        <MotionProvider><RootNavigator /></MotionProvider>
        <StatusBar style="dark" />
      </AuthProvider>
    </StripeProvider>
  );
}
