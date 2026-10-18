import React, { useState } from "react";
import { Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, depth, radius } from "../constants/theme";
import { calendarDayCount, displayCalendarDate, pickerDate } from "../utils/calendarDays";
import { monthCells, monthStart, selectCalendarDay, shiftMonth } from "../utils/calendarPicker";
import { MotionPressable, useReducedMotion } from "./Motion";
import { Action, Icon } from "./ui";

type Props = {
  startDate: string;
  endDate?: string;
  minimumDate: string;
  onConfirm: (start: string, end: string) => void;
  onClose: () => void;
};

export default function BookingCalendar({ startDate, endDate, minimumDate, onConfirm, onClose }: Props) {
  const range = endDate !== undefined;
  const [start, setStart] = useState(startDate < minimumDate ? minimumDate : startDate);
  const [end, setEnd] = useState(endDate && endDate >= start ? endDate : start);
  const [field, setField] = useState<"start" | "end">("start");
  const [month, setMonth] = useState(monthStart(start));
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const landscape = width > height;
  const compact = height < 700;
  const minimum = field === "end" ? start : minimumDate;
  const previousAllowed = shiftMonth(month, -1) >= monthStart(minimum);
  const nextAllowed = month < "2099-12-01";
  const cells = monthCells(month);
  const days = calendarDayCount(start, end);

  const select = (day: string) => {
    if (day < minimum) return;
    const next = selectCalendarDay(start, end, day, field, minimumDate);
    setStart(next.start); setEnd(range ? next.end : next.start);
    if (range && field === "start") setField("end");
  };
  const changeField = (next: "start" | "end") => {
    setField(next); setMonth(monthStart(next === "start" ? start : end));
  };
  const summary = <View style={styles.summary}>
    <MotionPressable accessibilityRole="button" accessibilityLabel={`First date, ${displayCalendarDate(start)}`}
      accessibilityState={{ selected: field === "start" }} onPress={() => changeField("start")}
      style={[styles.dateTab, field === "start" && styles.activeTab]}>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>{range ? "First date" : "Selected date"}</Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.dateValue}>{displayCalendarDate(start)}</Text>
    </MotionPressable>
    {range && <MotionPressable accessibilityRole="button" accessibilityLabel={`Last date, ${displayCalendarDate(end)}`}
      accessibilityState={{ selected: field === "end" }} onPress={() => changeField("end")}
      style={[styles.dateTab, field === "end" && styles.activeTab]}>
      <Text maxFontSizeMultiplier={1.3} style={styles.label}>Last date · included</Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.dateValue}>{displayCalendarDate(end)}</Text>
    </MotionPressable>}
  </View>;
  const footer = <View style={styles.footer}>
    <Text maxFontSizeMultiplier={1.3} style={styles.total}>{range ? `${days} calendar ${days === 1 ? "day" : "days"} · both dates included` : displayCalendarDate(start)}</Text>
    {!compact && range && <Text style={styles.note}>Availability is confirmed at checkout in the space’s time zone.</Text>}
    <Action label={range ? "Use these dates" : "Use this date"} onPress={() => onConfirm(start, end)} />
  </View>;

  return <Modal visible animationType={reduced ? "none" : "fade"} presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View accessibilityViewIsModal style={[styles.screen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12), paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>{range ? "Choose your dates" : "Choose a date"}</Text>
        <MotionPressable accessibilityRole="button" accessibilityLabel="Cancel date selection" onPress={onClose} style={styles.close}><Icon name="close" color={colors.primary} /></MotionPressable>
      </View>
      <View style={[styles.body, landscape && styles.landscape]}>
        {!landscape && summary}
        <View style={styles.calendar}>
          <View style={styles.monthBar}>
            <MotionPressable accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !previousAllowed }} disabled={!previousAllowed}
              onPress={() => setMonth(shiftMonth(month, -1))} style={styles.arrow}><Icon name="chevron-back" color={previousAllowed ? colors.primary : colors.border} /></MotionPressable>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={styles.month}>{pickerDate(month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
            <MotionPressable accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !nextAllowed }} disabled={!nextAllowed} onPress={() => setMonth(shiftMonth(month, 1))} style={styles.arrow}><Icon name="chevron-forward" color={nextAllowed ? colors.primary : colors.border} /></MotionPressable>
          </View>
          <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3} style={styles.hint}>{range ? `Choose your ${field === "start" ? "first" : "last"} date` : "Choose your parking date"}</Text>
          <View style={styles.weekdays}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <Text key={index} importantForAccessibility="no" maxFontSizeMultiplier={1.2} style={styles.weekday}>{day}</Text>)}</View>
          <View style={styles.grid}>
            {Array.from({ length: 6 }, (_, row) => <View key={row} style={styles.week}>
              {cells.slice(row * 7, row * 7 + 7).map((day, column) => {
                if (!day) return <View key={column} style={styles.cell} />;
                const disabled = day < minimum;
                const endpoint = day === start || (range && day === end);
                const within = range && day >= start && day <= end;
                return <View key={day} style={[styles.cell, within && styles.inRange, day === start && styles.rangeStart, day === end && styles.rangeEnd]}>
                  <MotionPressable accessibilityRole="button" accessibilityLabel={pickerDate(day).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    accessibilityState={{ disabled, selected: endpoint }} disabled={disabled} onPress={() => select(day)} style={[styles.day, endpoint && styles.selectedDay]}>
                    <Text maxFontSizeMultiplier={1.2} style={[styles.dayText, disabled && styles.disabledText, endpoint && styles.selectedText]}>{Number(day.slice(8))}</Text>
                  </MotionPressable>
                </View>;
              })}
            </View>)}
          </View>
        </View>
        {landscape ? <View style={styles.side}>{summary}{footer}</View> : footer}
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 52 },
  title: { color: colors.text, fontSize: 23, fontWeight: "700", letterSpacing: -0.5, flex: 1 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: colors.primarySoft },
  body: { flex: 1, gap: 12, maxWidth: 540, width: "100%", alignSelf: "center", paddingTop: 8 },
  landscape: { flexDirection: "row", maxWidth: 1000, paddingTop: 0 }, side: { width: "38%", justifyContent: "space-between" },
  summary: { flexDirection: "row", gap: 8 }, dateTab: { flex: 1, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4, backgroundColor: colors.paper },
  activeTab: { backgroundColor: colors.primarySoft, borderColor: colors.primary }, label: { color: colors.textMuted, fontSize: 12, fontWeight: "500" }, dateValue: { color: colors.primaryDark, fontSize: 15, fontWeight: "600" },
  calendar: { ...depth.soft, flex: 1, minHeight: 0, backgroundColor: colors.paper, borderRadius: radius.lg, padding: 10 },
  monthBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, arrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  month: { fontSize: 18, fontWeight: "600", color: colors.text }, hint: { color: colors.textMuted, textAlign: "center", fontSize: 12, marginBottom: 8 },
  weekdays: { flexDirection: "row", paddingVertical: 4 }, weekday: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 12 },
  grid: { flex: 1, justifyContent: "center" }, week: { flex: 1, maxHeight: 64, flexDirection: "row", alignItems: "center" },
  cell: { flex: 1, height: "85%", maxHeight: 48, alignItems: "center", justifyContent: "center" },
  inRange: { backgroundColor: colors.primarySoft }, rangeStart: { borderTopLeftRadius: 24, borderBottomLeftRadius: 24 }, rangeEnd: { borderTopRightRadius: 24, borderBottomRightRadius: 24 },
  day: { width: "100%", height: "100%", maxWidth: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" }, selectedDay: { backgroundColor: colors.primary },
  dayText: { color: colors.text, fontSize: 16, fontWeight: "500" }, disabledText: { color: "#A1AAA3" }, selectedText: { color: colors.paper, fontWeight: "700" },
  footer: { gap: 10, paddingTop: 4 }, total: { color: colors.primaryDark, fontSize: 14, fontWeight: "600", textAlign: "center" }, note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: "center" },
});
