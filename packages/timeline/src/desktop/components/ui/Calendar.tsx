import { DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";

export function Calendar(props: DayPickerProps) {
  return <DayPicker showOutsideDays {...props} className="ui-calendar" />;
}
