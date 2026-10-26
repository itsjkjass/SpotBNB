import { Alert, Linking } from "react-native";

export async function openPublicLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open this link", url.startsWith("mailto:") ? `Please email ${url.slice(7).split("?")[0]} using your email app.` : `Please try again, or open this address in your browser:\n\n${url}`);
  }
}
