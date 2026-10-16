import * as Primitive from "@radix-ui/react-context-menu";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";

/** shadcn/ui composition using Desktop's existing portal and theme tokens. */
export const ContextMenu = Primitive.Root;
export const ContextMenuTrigger = Primitive.Trigger;
export const ContextMenuLabel = Primitive.Label;
export const ContextMenuSeparator = Primitive.Separator;
export function ContextMenuContent(props: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content {...props} collisionPadding={8} className={`desktop-overlay ui-context-menu ${props.className ?? ""}`} /></Primitive.Portal>;
}
export function ContextMenuCheckboxItem({ children, ...props }: ComponentProps<typeof Primitive.CheckboxItem>) {
  return <Primitive.CheckboxItem {...props} className="ui-context-item">
    <span className="ui-context-indicator"><Primitive.ItemIndicator><Check /></Primitive.ItemIndicator></span>{children}
  </Primitive.CheckboxItem>;
}
