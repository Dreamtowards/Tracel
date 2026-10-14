import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className = "", ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return <PopoverPrimitive.Portal><PopoverPrimitive.Content align="start" sideOffset={6} collisionPadding={8} {...props} className={`ui-popover-content desktop-overlay ${className}`} /></PopoverPrimitive.Portal>;
}
