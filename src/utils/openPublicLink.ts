import { Alert, Linking } from "react-native";

export async function openPublicLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open the website", `Please try again, or open this address in your browser:\n\n${url}`);
  }
}
