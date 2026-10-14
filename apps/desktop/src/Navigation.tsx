import { Activity, ChartNoAxesCombined, Info, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";

export type Page = "timeline" | "metrics" | "settings";
export default function Navigation({ page, expanded, onToggle, onNavigate, onAbout }: {
  page: Page; expanded: boolean; onToggle: () => void; onNavigate: (page: Page) => void; onAbout: () => void;
}) {
  const items = [
    { page: "timeline" as const, label: "Timeline explorer", text: "Timeline", Icon: Activity },
    { page: "metrics" as const, label: "System metrics", text: "System metrics", Icon: ChartNoAxesCombined },
    { page: "settings" as const, label: "Settings", text: "Settings", Icon: Settings },
  ];
  return <nav className={`desktop-navigation${expanded ? " expanded" : ""}`} aria-label="Main navigation">
    <button className="desktop-nav-toggle" title={expanded ? "Collapse navigation" : "Expand navigation"} aria-label={expanded ? "Collapse navigation" : "Expand navigation"} aria-expanded={expanded} aria-controls="desktop-nav-pages" onClick={onToggle}>
      {expanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}<span>Navigation</span>
    </button>
    <div id="desktop-nav-pages" className="desktop-nav-pages">{items.map(({ page: target, label, text, Icon }) =>
      <button key={target} title={label} aria-label={label} aria-current={page === target ? "page" : undefined} onClick={() => onNavigate(target)}><Icon size={20} /><span>{text}</span></button>
    )}</div>
    <button className="desktop-nav-about" title="About client" aria-label="About client" onClick={onAbout}><Info size={20} /><span>About client</span></button>
  </nav>;
}
