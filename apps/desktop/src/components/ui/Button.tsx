import type { ComponentProps } from "react";

/** Desktop-owned shadcn-style variants, with borderless ghost as the default. */
export function Button({ variant = "ghost", className = "", type = "button", ...props }: ComponentProps<"button"> & { variant?: "ghost" | "secondary" }) {
  return <button {...props} type={type} data-variant={variant} className={`ui-button ui-button-${variant} ${className}`} />;
}
