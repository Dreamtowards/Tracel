import type { Metadata } from "next";
import { RadarConsole } from "@/radar/RadarConsole";
export const metadata: Metadata = {
  title: "Radar — 网站访问统计",
  description: "查看真实网站流量、匿名访客旅程，并把访问统计嵌入自己的网站。",
};
export default function RadarPage() {
  return <RadarConsole />;
}
