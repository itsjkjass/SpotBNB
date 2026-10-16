import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MessagesScreen from "../screens/Messages/MessagesScreen";
import ConversationScreen from "../screens/Messages/ConversationScreen";
import type { MessagesStackParamList } from "./types";
import { colors } from "../constants/theme";
const Stack = createNativeStackNavigator<MessagesStackParamList>();
export default function MessagesStack() {
  return <Stack.Navigator screenOptions={{ headerTintColor: colors.primary }}>
    <Stack.Screen name="Inbox" component={MessagesScreen} options={{ title: "Messages" }} />
    <Stack.Screen name="Conversation" component={ConversationScreen} options={{ title: "Booking messages" }} />
  </Stack.Navigator>;
}
