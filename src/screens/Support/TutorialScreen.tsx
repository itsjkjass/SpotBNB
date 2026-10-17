import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { colors, spacing } from "../../constants/theme";
import { Action, Icon, IconName, ui } from "../../components/ui";
import { useGuideReplay } from "../../components/ScreenGuide";
import type { GuideFlow } from "../../services/guideProgress";
import { useAuth } from "../../hooks/useAuth";

const guides: { flow: GuideFlow; title: string; body: string; icon: IconName; target: RootStackParamList["Main"] }[] = [
  { flow: "explore", title: "Find your parking space", body: "Search destinations, compare spaces and choose calendar dates.", icon: "search-outline", target: { screen: "SearchTab", params: { screen: "SearchMap" } } },
  { flow: "host", title: "Share a space", body: "Publish your listing, receive bookings and set up payouts later.", icon: "home-outline", target: { screen: "MyListingsTab", params: { screen: "MyListings" } } },
  { flow: "bookings", title: "Manage bookings", body: "Switch between your parking reservations and hosting.", icon: "calendar-outline", target: { screen: "BookingsTab", params: { screen: "BookingsList" } } },
  { flow: "messages", title: "Talk about a booking", body: "Find booking conversations and learn about blocking and reporting.", icon: "chatbubble-outline", target: { screen: "MessagesTab", params: { screen: "Inbox" } } },
  { flow: "profile", title: "Manage your account", body: "Find document checks, earnings, payout setup and help.", icon: "person-circle-outline", target: { screen: "ProfileTab", params: { screen: "Profile" } } },
];
export default function TutorialScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Tutorial">) {
  const replay = useGuideReplay();
  const { user } = useAuth();
  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={ui.heading}>Make yourself at home.</Text>
      <Text style={ui.body}>Short guides highlight the controls on each screen. Skip any guide, or replay it here whenever you need.</Text>
      {!user && <Action label="Sign in to see all guides" onPress={() => navigation.navigate("Auth")} />}
      {guides.map(guide => <View key={guide.flow} style={styles.section}>
        <View style={ui.row}><Icon name={guide.icon} color={colors.primary} /><Text style={[ui.subheading, { flex: 1 }]}>{guide.title}</Text></View>
        <Text style={ui.body}>{guide.body}</Text>
        <Action label={!user && guide.flow !== "explore" ? "Available after sign-in" : "Show highlights"} secondary
          disabled={!user && guide.flow !== "explore"}
          onPress={() => { replay(guide.flow); navigation.popTo("Main", guide.target); }} />
      </View>)}
      <Action label="Close guide" onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Main")} />
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: spacing.md },
  section: { gap: spacing.md, paddingVertical: spacing.lg, borderBottomWidth: 1, borderColor: colors.border },
});
