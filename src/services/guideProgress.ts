import AsyncStorage from "@react-native-async-storage/async-storage";

export type GuideFlow = "explore" | "host" | "bookings" | "messages" | "profile";
const seenThisSession = new Set<GuideFlow>();
const key = (flow: GuideFlow) => `spotbnb:guide:v2:${flow}`;

export async function shouldShowGuide(flow: GuideFlow, replay: boolean): Promise<boolean> {
  if (replay) return true;
  if (seenThisSession.has(flow)) return false;
  try { return await AsyncStorage.getItem(key(flow)) !== "seen"; }
  catch { return false; } // A local storage failure must never block browsing.
}
export function finishGuide(flow: GuideFlow): void {
  seenThisSession.add(flow);
  AsyncStorage.setItem(key(flow), "seen").catch(() => {});
}
