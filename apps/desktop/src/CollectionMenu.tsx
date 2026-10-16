import { cloneElement, type ReactElement, type HTMLAttributes } from "react";
import { useI18n } from "@tracel/timeline";
import type { CollectionSettings, CollectionStatus } from "./native";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuCheckboxItem, ContextMenuLabel, ContextMenuSeparator } from "./components/ui/ContextMenu";

const groups = [
  ["Application activity", [["foreground", "Foreground apps and window titles"], ["background", "Apps"], ["idle", "Idle / AFK detection"]]],
  ["System performance", [["cpu", "CPU usage"], ["cpuFrequency", "CPU frequency"], ["ram", "RAM usage"], ["gpu", "GPU usage and memory"], ["network", "Network traffic"], ["disk", "Disk activity"], ["battery", "Battery and power"]]],
  ["AUDIO & MEDIA", [["audioInput", "Audio input level"], ["audio", "Audio output level"], ["media", "Now playing"]]],
] as const;

export default function CollectionMenu({ children, status, busy, onSettings, simplifyGpuNames, showSoftwareGpus, onSimplifyGpuNames, onShowSoftwareGpus }: {
  simplifyGpuNames: boolean; showSoftwareGpus: boolean;
  onSimplifyGpuNames: (value: boolean) => void; onShowSoftwareGpus: (value: boolean) => void;
  children: ReactElement; status: CollectionStatus | null; busy: boolean;
  onSettings: (settings: CollectionSettings) => Promise<void>;
}) {
  const { t } = useI18n();
  const settings = status?.settings;
  const disabled = busy || !status?.supported || !settings;
  const item = (key: keyof CollectionSettings, label: string) => <ContextMenuCheckboxItem key={key}
    checked={!!settings?.[key]} disabled={disabled}
    onCheckedChange={(checked) => { if (settings && !disabled) void onSettings({ ...settings, [key]: checked === true }); }}>
    {t(label)}
  </ContextMenuCheckboxItem>;
  return <ContextMenu><ContextMenuTrigger asChild>
    {cloneElement(children as ReactElement<HTMLAttributes<HTMLElement>>, { tabIndex: 0, "aria-label": t("Track collection · right-click to configure"), title: t("Right-click track headers to configure collection") })}
  </ContextMenuTrigger><ContextMenuContent aria-label={t("Collection")}>
    <ContextMenuLabel className="ui-context-label">{t("Collection")}</ContextMenuLabel>
    {item("enabled", "Enable collection")}
    {groups.map(([label, fields]) => <div key={label} role="group" aria-label={t(label)}>
      <ContextMenuSeparator className="ui-context-separator" />
      <ContextMenuLabel className="ui-context-label">{t(label)}</ContextMenuLabel>
      {fields.map(([key, name]) => item(key, name))}
    </div>)}
    <ContextMenuSeparator className="ui-context-separator" />
    <ContextMenuLabel className="ui-context-label">{t("GPU display")}</ContextMenuLabel>
    <ContextMenuCheckboxItem checked={simplifyGpuNames} onCheckedChange={value => onSimplifyGpuNames(value === true)}>{t("Simplify GPU names")}</ContextMenuCheckboxItem>
    <ContextMenuCheckboxItem checked={showSoftwareGpus} onCheckedChange={value => onShowSoftwareGpus(value === true)}>{t("Show software rendering adapters")}</ContextMenuCheckboxItem>
    <ContextMenuSeparator className="ui-context-separator" />
    <p className="ui-context-hint">{t("Changes affect new measurements. Saved history is kept.")}</p>
  </ContextMenuContent></ContextMenu>;
}
