import type { ComponentProps } from "react";

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} data-slot="card" className={`ui-card ${className}`} />;
}
