import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

/** Owned, CSS-styled primitive following the shadcn component pattern. */
export function Switch(props: ComponentProps<typeof SwitchPrimitive.Root>) {
  return <SwitchPrimitive.Root {...props} className="ui-switch"><SwitchPrimitive.Thumb className="ui-switch-thumb" /></SwitchPrimitive.Root>;
}
