import type { ReactNode } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/styles/live.css";
import "@/styles/industrial.css";
export default function RadarLayout({ children }: { children: ReactNode }) {
  return <div lang="en" style={{ display: "contents" }}>{children}</div>;
}
