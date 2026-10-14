import type { Metadata } from "next";
import TimelineDemo from "./TimelineDemo";

export const metadata: Metadata = {
  title: "Tracel — Activity & Performance Explorer",
  description:
    "Explore application activity and system performance on one interactive timeline. A local, simulated capture.",
};

export default function TimelinePage() {
  return <TimelineDemo />;
}
