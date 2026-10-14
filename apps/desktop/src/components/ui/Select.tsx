import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

/** shadcn/ui composition, styled with Desktop's shared design tokens. */
export function Select({ id, label, value, onValueChange, options }: {
  id: string; label: string; value: string; onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
    <SelectPrimitive.Trigger id={id} className="ui-select-trigger" aria-label={label}>
      <SelectPrimitive.Value /><SelectPrimitive.Icon asChild><ChevronDown size={14} /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className="ui-select-content desktop-overlay" position="popper" sideOffset={5} collisionPadding={8}>
        <SelectPrimitive.ScrollUpButton className="ui-select-scroll"><ChevronUp size={14} /></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="ui-select-viewport">
          {options.map((option) => <SelectPrimitive.Item key={option.value} value={option.value} className="ui-select-item">
            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator><Check size={14} /></SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>)}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="ui-select-scroll"><ChevronDown size={14} /></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}
