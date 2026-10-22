import { RadarEmbed } from "@/radar/RadarEmbed";
export const metadata = {
  title: "Radar · 网站访问统计",
  robots: { index: false, follow: false },
};
export default function EmbedPage() {
  return <RadarEmbed />;
}
