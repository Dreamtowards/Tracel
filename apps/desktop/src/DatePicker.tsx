import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Calendar } from "./components/ui/Calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/Popover";

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function DatePicker({ value, min, max, onChange }: {
  value: string; min: string; max: string; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value), first = parseDate(min), last = parseDate(max);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button className="ui-date-trigger" aria-label="Capture date" title="Choose capture date"><CalendarDays size={14} /><span>{selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span><ChevronDown size={13} /></button></PopoverTrigger>
    <PopoverContent aria-label="Choose capture date" className="ui-date-popover">
      <Calendar mode="single" required selected={selected} defaultMonth={selected} startMonth={first} endMonth={last} disabled={[{ before: first }, { after: last }]} autoFocus
        onSelect={(day) => {
          onChange(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`);
          setOpen(false);
        }} />
    </PopoverContent>
  </Popover>;
}
