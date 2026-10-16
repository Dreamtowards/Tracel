import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans-condensed/latin-400.css";
import "@fontsource/ibm-plex-sans-condensed/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tracel — 看见时间去了哪里",
  description:
    "把应用、窗口、系统性能和媒体状态记录在同一条时间轴上。Tracel 是一个本地优先的 Windows 电脑活动与状态记录工具。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
