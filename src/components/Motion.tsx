import React, { createContext, useContext, useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";

const MotionContext = createContext(true);
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { changed = true; setReduced(value); });
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) setReduced(value); }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);
  return <MotionContext.Provider value={reduced}>{children}</MotionContext.Provider>;
}
export function useReducedMotion() { return useContext(MotionContext); }

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({ style, children, onPressIn, onPressOut, ...props }: Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => { if (reduced) { scale.stopAnimation(); scale.setValue(1); } return () => scale.stopAnimation(); }, [reduced, scale]);
  const animate = (value: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: value, speed: 28, bounciness: 0, useNativeDriver: true }).start();
  };
  return <AnimatedPressable {...props} style={[style, { transform: [{ scale }] }]}
    onPressIn={event => { animate(0.975); onPressIn?.(event); }}
    onPressOut={event => { animate(1); onPressOut?.(event); }}>{children}</AnimatedPressable>;
}

export function Reveal({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { progress.stopAnimation(); progress.setValue(1); return; }
    const animation = Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, progress]);
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}
