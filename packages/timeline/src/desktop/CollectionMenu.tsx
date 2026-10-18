import { cloneElement, type ReactElement, type HTMLAttributes } from "react";
import { useI18n } from "@tracel/timeline";
import type { CollectionSettings } from "./platformTypes";
export type { CollectionSettings } from "./platformTypes";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuCheckboxItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent } from "./components/ui/ContextMenu";
import type { TrackSource } from "../trackVisibility";

const groups = [
  ["Application activity", [["foreground", "Foreground apps and window titles"], ["background", "Apps"], ["idle", "Idle / AFK detection"]]],
  ["System performance", [["cpu", "CPU usage"], ["cpuFrequency", "CPU frequency"], ["ram", "RAM usage"], ["gpu", "GPU usage and memory"], ["network", "Network traffic"], ["disk", "Disk activity"], ["battery", "Battery and power"]]],
  ["AUDIO & MEDIA", [["audioInput", "Audio input level"], ["audio", "Audio output level"], ["media", "Now playing"]]],
] as const;

type CollectionStatus = { supported: boolean; settings: CollectionSettings };

export default function CollectionMenu({ children, status, busy, onSettings, simplifyGpuNames, showSoftwareGpus, onSimplifyGpuNames, onShowSoftwareGpus, hiddenSources = [], onHiddenSourcesChange, demo = false }: {
  hiddenSources?: readonly TrackSource[]; onHiddenSourcesChange?: (sources: readonly TrackSource[]) => void;
  demo?: boolean;
  simplifyGpuNames: boolean; showSoftwareGpus: boolean;
  onSimplifyGpuNames: (value: boolean) => void; onShowSoftwareGpus: (value: boolean) => void;
  children: ReactElement; status: CollectionStatus | null; busy: boolean;
  onSettings: (settings: CollectionSettings) => Promise<void | boolean>;
}) {
  const { t } = useI18n();
  const settings = status?.settings;
  const disabled = busy || !status?.supported || !settings;
  const item = (key: keyof CollectionSettings, label: string) => <ContextMenuCheckboxItem key={key}
    checked={!!settings?.[key]} disabled={disabled}
    onCheckedChange={(checked) => {
      if (settings && !disabled) void onSettings({ ...settings, [key]: checked === true }).then(success => {
        if (success !== false && checked === true && key !== "enabled") onHiddenSourcesChange?.(hiddenSources.filter(source => source !== key));
      });
    }}>
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
    {onHiddenSourcesChange && <>
      <ContextMenuSeparator className="ui-context-separator" />
      <ContextMenuSub><ContextMenuSubTrigger>{t("Track visibility")}</ContextMenuSubTrigger><ContextMenuSubContent aria-label={t("Track visibility")}>
        <ContextMenuLabel className="ui-context-label">{t("Visible tracks")}</ContextMenuLabel>
        {groups.flatMap<readonly [TrackSource, string]>(([, fields]) => fields).map(([key, label]) => <ContextMenuCheckboxItem key={key} checked={!hiddenSources.includes(key)} disabled={disabled}
          onCheckedChange={(value) => {
            if (!settings || disabled) return;
            if (value === true) onHiddenSourcesChange(hiddenSources.filter(source => source !== key));
            else void onSettings({ ...settings, [key]: false }).then(success => {
              if (success !== false) onHiddenSourcesChange([...new Set([...hiddenSources, key])]);
            });
          }}>{t(label)}</ContextMenuCheckboxItem>)}
        <ContextMenuSeparator className="ui-context-separator" />
        <p className="ui-context-hint">{t("Hiding also stops collection. Showing restores history without starting collection.")}</p>
      </ContextMenuSubContent></ContextMenuSub>
    </>}
    <ContextMenuSeparator className="ui-context-separator" />
    <ContextMenuLabel className="ui-context-label">{t("GPU display")}</ContextMenuLabel>
    <ContextMenuCheckboxItem checked={simplifyGpuNames} onCheckedChange={value => onSimplifyGpuNames(value === true)}>{t("Simplify GPU names")}</ContextMenuCheckboxItem>
    <ContextMenuCheckboxItem checked={showSoftwareGpus} onCheckedChange={value => onShowSoftwareGpus(value === true)}>{t("Show software rendering adapters")}</ContextMenuCheckboxItem>
    <ContextMenuSeparator className="ui-context-separator" />
    <p className="ui-context-hint">{demo ? t("Demo only: switches do not collect data from your computer.") : t("Changes affect new measurements. Saved history is kept.")}</p>
  </ContextMenuContent></ContextMenu>;
}
