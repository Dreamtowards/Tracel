import type { Metadata } from "next";
import "./globals.css";

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
