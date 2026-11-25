import type { Metadata } from "next";
import QuotaApp from "./QuotaApp";

export const metadata: Metadata = {
  title: "Quota",
  description: "在同一条时间轴上回看多个 AI 账号的剩余额度、周期重置和余额变化。当前提供每五分钟采样的 30 天模拟数据。",
};

export default function QuotaPage() { return <QuotaApp />; }
