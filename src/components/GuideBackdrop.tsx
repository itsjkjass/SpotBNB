import React, { createContext, useContext, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Path } from "react-native-svg";
import type { GuideRect } from "../utils/guideLayout";

const BlurContext = createContext<React.RefObject<View | null> | undefined>(undefined);
export function GuideBackdropProvider({ children }: { children: React.ReactNode }) {
  const target = useRef<View>(null);
  return <BlurContext.Provider value={target}>
    <BlurTargetView ref={target} style={styles.fill}>{children}</BlurTargetView>
  </BlurContext.Provider>;
}

export function GuideBackdrop({ hole, width, height }: { hole: GuideRect | null; width: number; height: number }) {
  const target = useContext(BlurContext);
  let mask = `M0 0H${width}V${height}H0Z`;
  if (hole) {
    const { x, y, width: w, height: h } = hole;
    const r = Math.min(20, w / 2, h / 2);
    mask += ` M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
  }
  return <MaskedView style={StyleSheet.absoluteFill} androidRenderingMode="software"
    maskElement={<Svg width={width} height={height}><Path d={mask} fill="black" fillRule="evenodd" /></Svg>}>
    <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, styles.shade]} />
  </MaskedView>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, shade: { backgroundColor: "rgba(9, 30, 21, 0.44)" } });
