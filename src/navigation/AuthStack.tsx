import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "../screens/Auth/LoginScreen";
import SignupScreen from "../screens/Auth/SignupScreen";

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

import { useReducedMotion } from "../components/Motion";

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  const reducedMotion = useReducedMotion();
  return (
    <Stack.Navigator screenOptions={{ animation: reducedMotion ? "none" : "slide_from_right", headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}
