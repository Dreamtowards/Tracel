"use client";

import dynamic from "next/dynamic";

// Appearance is browser-local; prerendering cannot know the saved locale or zoom.
const DemoApp = dynamic(() => import("./DemoApp"), { ssr: false, loading: () => <p style={{ padding: 24 }}>正在打开 Tracel 演示…</p> });

export default function TimelineDemo() {
  return <DemoApp />;
}
