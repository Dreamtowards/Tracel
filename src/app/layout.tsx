import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource/ibm-plex-sans-condensed/latin-400.css";
import "@fontsource/ibm-plex-sans-condensed/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./globals.css";
import "@/styles/live.css";
import "@/styles/industrial.css";

export const metadata: Metadata = {
  title: "Tracel — Live website observation",
  description:
    "A live view of visitors, events and journeys. Tracel visual MVP with locally simulated telemetry.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
