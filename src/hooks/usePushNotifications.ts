import { useEffect, useRef } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "./useAuth";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const openMessage = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const { identifier, content } = response.notification.request;
      const { type, bookingId } = content.data ?? {};
      if (handled.current === identifier || type !== "booking_message" || typeof bookingId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(bookingId)) return;
      handled.current = identifier;
      navigation.navigate("Main", { screen: "MessagesTab", params: { screen: "Conversation", params: { bookingId } } });
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openMessage);
    Notifications.getLastNotificationResponseAsync().then(openMessage).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, [user, navigation]);

  useEffect(() => {
    if (!user || !Device.isDevice) return;

    (async () => {
      try {
        const existing = await Notifications.getPermissionsAsync();
        let finalStatus = existing.status;
        if (finalStatus !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          finalStatus = requested.status;
        }
        if (finalStatus !== "granted") return;

        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync();
        await setDoc(doc(db, "users", user.uid), { expoPushToken: tokenResponse.data }, { merge: true });
      } catch (error) {
        // Remote push tokens require a development build (unsupported in Expo Go on newer SDKs) -
        // this is expected there and shouldn't block the rest of the app.
        console.warn("Push notification registration skipped:", error);
      }
    })();
  }, [user]);
}
