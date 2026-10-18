import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { finishGuide, GuideFlow, shouldShowGuide } from "../services/guideProgress";
import { guideLayout, GuideRect } from "../utils/guideLayout";
import { colors, depth, radius, spacing } from "../constants/theme";
import { Action, ui } from "./ui";
import { GuideBackdrop, GuideBackdropProvider } from "./GuideBackdrop";

import { Reveal, useReducedMotion } from "./Motion";

type Step = { title: string; body: string };
const STEPS: Record<GuideFlow, Step[]> = {
  explore: [
    { title: "Start with your destination", body: "Search a city or address, then choose calendar dates and filters. Each selected date counts as one day. Availability is confirmed at checkout." },
    { title: "Explore your way", body: "Switch between map and list to compare spaces. Tap a space to see its photos, details and daily price. You can browse before signing in." },
  ],
  host: [
    { title: "Manage your hosting", body: "Open Bookings to see reservations for your spaces, or Earnings to manage completed bookings and withdrawals." },
    { title: "Add your first space", body: "Add photos, an address and a price per calendar day. You can receive bookings before setting up payouts; complete payout setup before withdrawing earnings." },
  ],
  bookings: [
    { title: "Parking and hosting, together", body: "My parking shows spaces you reserved. Hosting shows reservations made for your spaces." },
    { title: "Find the booking you need", body: "Upcoming & current includes parking in progress. Past includes completed and cancelled bookings. Open a booking to check payment status, message the other person or see available actions." },
  ],
  messages: [{ title: "Keep plans with the booking", body: "Conversations become available after a booking is confirmed. Open a booking to start a chat. Messages are text only; hold a received message to report it, or use Block messages in the conversation." }],
  profile: [{ title: "Your account and setup", body: "Manage optional document checks, earnings and payout setup here. You can use the app without a document badge. Find Help, the privacy-policy draft and replayable guides below." }],
};
type Request = { flow: GuideFlow; id: number } | null;
const GuideContext = createContext<{ request: Request; replay: (flow: GuideFlow) => void }>({ request: null, replay: () => {} });
export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request>(null);
  const replay = useCallback((flow: GuideFlow) => setRequest(previous => ({ flow, id: (previous?.id ?? 0) + 1 })), []);
  const value = useMemo(() => ({ request, replay }), [request, replay]);
  return <GuideContext.Provider value={value}><GuideBackdropProvider>{children}</GuideBackdropProvider></GuideContext.Provider>;
}
export function useGuideReplay() { return useContext(GuideContext).replay; }

export function useScreenGuide(flow: GuideFlow, ready = true) {
  const { request } = useContext(GuideContext);
  const focused = useIsFocused();
  const [step, setStep] = useState<number | null>(null);
  const handledRequest = useRef(0);
  const firstTarget = useRef<View>(null);
  const secondTarget = useRef<View>(null);
  useFocusEffect(useCallback(() => {
    if (!ready) return;
    let active = true;
    const manual = request?.flow === flow && request.id !== handledRequest.current;
    shouldShowGuide(flow, manual).then(show => {
      if (!active) return;
      if (manual && request) handledRequest.current = request.id;
      setStep(show ? 0 : null);
    });
    return () => { active = false; };
  }, [flow, ready, request]));
  const close = () => { finishGuide(flow); setStep(null); };
  return {
    firstTarget, secondTarget,
    overlay: step !== null && focused && ready ? <GuideOverlay key={`${flow}:${step}`} step={step} steps={STEPS[flow]}
      target={step === 0 ? firstTarget : secondTarget} onClose={close} onStep={setStep} /> : null,
  };
}

function GuideOverlay({ step, steps, target, onClose, onStep }: {
  step: number; steps: Step[]; target: React.RefObject<View | null>; onClose: () => void; onStep: (step: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [rect, setRect] = useState<GuideRect | null | undefined>(undefined);
  useLayoutEffect(() => {
    let active = true;
    const timer = globalThis.setTimeout(() => target.current?.measureInWindow((x, y, w, h) => {
      if (active) setRect({ x, y, width: w, height: h });
    }), 200);
    const fallback = globalThis.setTimeout(() => { if (active) setRect(current => current === undefined ? null : current); }, 500);
    return () => { active = false; globalThis.clearTimeout(timer); globalThis.clearTimeout(fallback); };
  }, [target, width, height, fontScale]);
  if (rect === undefined) return null;
  const layout = guideLayout(rect, width, height, insets.top, insets.bottom);
  const hole = layout.hole;
  return <Modal transparent statusBarTranslucent navigationBarTranslucent presentationStyle="overFullScreen" animationType={reducedMotion ? "none" : "fade"} onRequestClose={onClose}>
    <View style={styles.screen} accessibilityViewIsModal>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <GuideBackdrop hole={hole} width={width} height={height} />
        {hole && <View style={[styles.ring, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]} />}
      </View>
      <Reveal style={[styles.card, { top: layout.cardTop, maxHeight: layout.cardMaxHeight }]}>
      <ScrollView style={styles.cardClip} contentContainerStyle={styles.content}>
        <View style={styles.toolbar}><Text style={ui.label}>Quick guide · {step + 1} of {steps.length}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.skip}><Text style={styles.link}>Skip</Text></TouchableOpacity></View>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={ui.subheading}>{steps[step].title}</Text>
        <Text style={ui.body}>{steps[step].body}</Text>
        <Action label={step === steps.length - 1 ? "Got it" : "Next"} onPress={() => step === steps.length - 1 ? onClose() : onStep(step + 1)} />
        {step > 0 && <TouchableOpacity accessibilityRole="button" style={styles.back} onPress={() => onStep(step - 1)}><Text style={styles.link}>Back</Text></TouchableOpacity>}
      </ScrollView>
      </Reveal>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  ring: { position: "absolute", borderColor: "#D9F5E5", borderWidth: 2, borderRadius: 20, boxShadow: "0px 0px 20px rgba(141, 229, 179, 0.4)" },
  card: { ...depth.floating, position: "absolute", left: 16, right: 16, backgroundColor: colors.paper, borderRadius: radius.lg },
  cardClip: { borderRadius: radius.lg },
  content: { padding: spacing.lg, gap: spacing.md }, toolbar: { ...ui.row, flexWrap: "wrap", justifyContent: "space-between" },
  skip: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" }, link: { color: colors.primary, fontWeight: "600", fontSize: 16 },
  back: { alignItems: "center", padding: spacing.sm },
});
