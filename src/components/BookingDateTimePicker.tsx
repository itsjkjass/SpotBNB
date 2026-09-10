import React from "react";
import { Platform, Text, TouchableOpacity } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

interface Props {
  value: Date;
  minimumDate: Date;
  onChange: (date: Date) => void;
  disabled?: boolean;
}

export default function BookingDateTimePicker({ value, minimumDate, onChange, disabled }: Props) {
  if (Platform.OS !== "android") {
    return <DateTimePicker value={value} minimumDate={minimumDate} mode="datetime"
      display="compact" disabled={disabled} onChange={(_, date) => date && onChange(date)} />;
  }

  const open = () => {
    DateTimePickerAndroid.open({
      value, minimumDate, mode: "date",
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        DateTimePickerAndroid.open({
          value: date, mode: "time",
          onChange: (timeEvent, time) => {
            if (timeEvent.type === "set" && time) onChange(time);
          },
        });
      },
    });
  };

  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={open}>
    <Text>{value.toLocaleString()}</Text>
  </TouchableOpacity>;
}
