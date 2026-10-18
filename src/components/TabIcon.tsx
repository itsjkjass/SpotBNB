import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Icon, IconName } from "./ui";
import { useReducedMotion } from "./Motion";
import { colors } from "../constants/theme";

export default function TabIcon({ name, color, size, focused }: { name: IconName; color: string; size: number; focused: boolean }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    if (reduced) { progress.stopAnimation(); progress.setValue(focused ? 1 : 0); return; }
    const animation = Animated.spring(progress, { toValue: focused ? 1 : 0, speed: 22, bounciness: 0, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [focused, reduced, progress]);
  return <View style={styles.container}>
    <Animated.View style={[styles.pill, { opacity: progress, transform: [{ scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) }] }]} />
    <Animated.View style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}><Icon name={name} size={size} color={color} /></Animated.View>
  </View>;
}
const styles = StyleSheet.create({ container: { width: 52, height: 32, alignItems: "center", justifyContent: "center" }, pill: { ...StyleSheet.absoluteFill, borderRadius: 16, backgroundColor: colors.primarySoft } });
