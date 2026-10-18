import React from "react";
import { Platform, Text } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { colors } from "../constants/theme";
import { MotionPressable } from "./Motion";

interface Props {
  value: Date;
  minimumDate: Date;
  onChange: (date: Date) => void;
  disabled?: boolean;
}

export default function BookingDateTimePicker({ value, minimumDate, onChange, disabled }: Props) {
  if (Platform.OS !== "android") {
    return <DateTimePicker value={value} minimumDate={minimumDate} mode="date"
      themeVariant="light" accentColor={colors.primary} display="compact" disabled={disabled} onChange={(_, date) => date && onChange(date)} />;
  }

  const open = () => {
    DateTimePickerAndroid.open({
      value, minimumDate, mode: "date",
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        onChange(date);
      },
    });
  };

  return <MotionPressable accessibilityRole="button" disabled={disabled} onPress={open}>
    <Text style={{ color: colors.text, fontSize: 17, paddingVertical: 14 }}>{value.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
  </MotionPressable>;
}
