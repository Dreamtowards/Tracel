import * as Tooltip from "@radix-ui/react-tooltip";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export const TooltipProvider = Tooltip.Provider;

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild><Button className="info-tip-trigger" aria-label={label}><CircleHelp size={14} /></Button></Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Content className="desktop-overlay info-tip-content" sideOffset={6} collisionPadding={12}>
      {children}
    </Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root>;
}
