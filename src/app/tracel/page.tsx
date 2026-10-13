import type { Metadata } from "next";
import Explorer from "@/tracel/Explorer";

export const metadata: Metadata = {
  title: "Tracel — Activity & Performance Explorer",
  description:
    "Explore application activity and system performance on one interactive timeline. A local, simulated capture.",
};

export default function TracelPage() {
  return <Explorer />;
}
