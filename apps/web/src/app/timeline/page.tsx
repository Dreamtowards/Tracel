import type { Metadata } from "next";
import TimelineDemo from "./TimelineDemo";

export const metadata: Metadata = {
  title: "Tracel — 在线演示",
  description:
    "体验与 Tracel 桌面版共用的时间轴界面：缩放、选区分析、GPU 引擎、显存、电池和音频轨道。全部为示例数据，不监测本机。",
};

export default function TimelinePage() {
  return <TimelineDemo />;
}
