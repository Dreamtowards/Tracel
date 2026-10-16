import type { Metadata } from "next";
import { RadarView } from "@/components/radar/RadarView";
export const metadata: Metadata = {
  title: "Tracel Radar — Live website observation demo",
  description: "Explore simulated visitors, events and journeys on an interactive map and globe. An independent Tracel experiment.",
};
export default function RadarPage() { return <RadarView />; }
