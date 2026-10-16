import { useI18n, type Locale } from "../index";
import { Button } from "./components/ui/Button";
import { Select } from "./components/ui/Select";
import { SettingsGroup } from "./components/SettingsGroup";
import { accentPresets, defaultAccent } from "./theme";
import { zoomLevels } from "./useAppearance";

export function AppearanceSettings({ language, onLanguage, zoom, onZoom, accent, onAccent }: {
  language: Locale; onLanguage: (value: Locale) => void;
  zoom: number; onZoom: (value: number) => void;
  accent: string; onAccent: (value: string) => void;
}) {
  const { t } = useI18n();
  return <SettingsGroup title={t("Appearance")}>
      <div className="settings-action"><label htmlFor="interface-language"><strong>{t("Language")}</strong></label><Select id="interface-language" label={t("Language")} value={language} onValueChange={(value) => onLanguage(value as Locale)} options={[{ value: "en", label: "English" }, { value: "zh-CN", label: "中文" }]} /></div>
      <div className="settings-action settings-zoom"><label htmlFor="interface-zoom"><strong>{t("Interface zoom")}</strong><small>{t("Ctrl + / - to adjust; Ctrl 0 to reset")}</small></label>
        <Select id="interface-zoom" label={t("Interface zoom")} value={String(zoom)} onValueChange={(value) => onZoom(Number(value))} options={zoomLevels.map((level) => ({ value: String(level), label: `${level}%` }))} />
      </div>
      <div className="settings-action settings-accent"><div><strong>{t("Accent color")}</strong></div>
        <div className="accent-options">{accentPresets.map(({ name, color }) => <button key={name} className="accent-swatch" style={{ background: color }} aria-label={t("{name} accent", { name: t(name) })} aria-pressed={accent === color} title={t(name)} onClick={() => onAccent(color)} />)}
          <label className="accent-custom" title={t("Custom accent color")}><span>{t("Custom")}</span><input type="color" aria-label={t("Custom accent color")} value={accent} onChange={(event) => onAccent(event.target.value)} /></label>
          {accent !== defaultAccent && <Button className="tx-text-button" onClick={() => onAccent(defaultAccent)}>{t("Reset")}</Button>}
        </div>
      </div>
    </SettingsGroup>;
}
