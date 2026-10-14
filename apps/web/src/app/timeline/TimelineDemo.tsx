"use client";

import { Explorer } from "@tracel/timeline";
import { demoProvider } from "@tracel/timeline/mock";

export default function TimelineDemo() {
  return <Explorer provider={demoProvider} />;
}
