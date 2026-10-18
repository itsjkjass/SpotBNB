import React, { useState } from "react";
import { Text } from "react-native";
import { colors } from "../constants/theme";
import { MotionPressable } from "./Motion";
import BookingCalendar from "./BookingCalendar";
import { pickerDate, pickerDateString } from "../utils/calendarDays";

interface Props {
  value: Date;
  minimumDate: Date;
  onChange: (date: Date) => void;
  disabled?: boolean;
}

export default function BookingDateTimePicker({ value, minimumDate, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  return <><MotionPressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={() => setOpen(true)}>
    <Text style={{ color: colors.text, fontSize: 17, paddingVertical: 14 }}>{value.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
  </MotionPressable>
    {open && !disabled && <BookingCalendar startDate={pickerDateString(value)} minimumDate={pickerDateString(minimumDate)}
      onClose={() => setOpen(false)} onConfirm={date => { setOpen(false); onChange(pickerDate(date)); }} />}
  </>;
}
