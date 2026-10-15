import { useI18n, type Locale } from "@tracel/timeline";
import { Button } from "./components/ui/Button";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { navigationDefault, navigationMax, navigationMin } from "./useAppearance";
import { Activity, ChartNoAxesCombined, Info, PanelLeftClose, PanelLeftOpen, Wrench, Settings, Volume2 } from "lucide-react";

export type Page = "timeline" | "metrics" | "audio" | "utilities" | "settings";
export default function Navigation({ page, expanded, width, onWidth, onToggle, onNavigate, onAbout }: {
  page: Page; expanded: boolean; width: number; onWidth: (width: number) => void; onToggle: () => void; onNavigate: (page: Page) => void; onAbout: () => void;
}) {
  const { t } = useI18n();
  const nav = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number; scale: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(Infinity);
  useEffect(() => {
    const shell = nav.current?.parentElement;
    if (!shell) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  const maximum = Math.min(navigationMax, Math.max(navigationMin, Math.floor(availableWidth * .36)));
  const displayedWidth = Math.min(width, maximum);
  const items = [
    { page: "timeline" as const, label: "Timeline explorer", text: "Timeline", Icon: Activity },
    { page: "metrics" as const, label: "System metrics", text: "System metrics", Icon: ChartNoAxesCombined },
    { page: "utilities" as const, label: "Utilities", text: "Utilities", Icon: Wrench },
    { page: "audio" as const, label: "Audio", text: "Audio", Icon: Volume2 },
    { page: "settings" as const, label: "Settings", text: "Settings", Icon: Settings },
  ];
  return <nav ref={nav} style={{ "--nav-width": `${displayedWidth}px` } as CSSProperties} className={`desktop-navigation${expanded ? " expanded" : ""}${resizing ? " resizing" : ""}`} aria-label={t("Main navigation")}>
    <Button className="desktop-nav-toggle" title={t(expanded ? "Collapse navigation" : "Expand navigation")} aria-label={t(expanded ? "Collapse navigation" : "Expand navigation")} aria-expanded={expanded} aria-controls="desktop-nav-pages" onClick={onToggle}>
      {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}<span>Tracel</span>
    </Button>
    <div id="desktop-nav-pages" className="desktop-nav-pages">{items.map(({ page: target, label, text, Icon }) =>
      <Button key={target} title={t(label)} aria-label={t(label)} aria-current={page === target ? "page" : undefined} onClick={() => onNavigate(target)}><Icon size={18} /><span>{t(text)}</span></Button>
    )}</div>
    <Button className="desktop-nav-about" title={t("About client")} aria-label={t("About client")} onClick={onAbout}><Info size={18} /><span>{t("About")}</span></Button>
    <div className="desktop-nav-resizer" role="separator" tabIndex={0} aria-label={t("Navigation width")} aria-orientation="vertical" aria-valuemin={navigationMin} aria-valuemax={maximum} aria-valuenow={expanded ? displayedWidth : navigationMin} title={t("Drag to resize · Double-click to reset")}
      onPointerDown={(event) => {
        if (event.button !== 0 || !nav.current) return;
        event.preventDefault();
        const bounds = nav.current.getBoundingClientRect();
        drag.current = { x: event.clientX, width: expanded ? nav.current.offsetWidth : navigationMin, scale: bounds.width / nav.current.offsetWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizing(true);
      }}
      onPointerMove={(event) => {
        if (drag.current) onWidth(drag.current.width + (event.clientX - drag.current.x) / drag.current.scale);
      }}
      onPointerUp={(event) => { drag.current = null; setResizing(false); event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
      onDoubleClick={() => onWidth(navigationDefault)}
      onKeyDown={(event) => {
        const next = event.key === "ArrowLeft" ? displayedWidth - 8 : event.key === "ArrowRight" ? displayedWidth + 8 : event.key === "Home" ? navigationMin : event.key === "End" ? maximum : null;
        if (next !== null) { event.preventDefault(); event.stopPropagation(); onWidth(next); }
      }} />
  </nav>;
}
