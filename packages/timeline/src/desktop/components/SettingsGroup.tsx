import { useId, type ReactNode } from "react";
import { useI18n } from "@tracel/timeline";
import { Card } from "./ui/Card";
import { Switch } from "./ui/Switch";

export function SettingsGroup({ title, children, help }: { title: string; children: ReactNode; help?: ReactNode }) {
  const id = useId();
  return <section className="settings-group" aria-labelledby={id}><div className="settings-group-heading"><h2 id={id}>{title}</h2>{help}</div><Card className="settings-card">{children}</Card></section>;
}

export function SettingToggle({ label, description, checked, disabled, pending, onChange }: {
  label: string; description: string; checked: boolean; disabled?: boolean; pending?: boolean; onChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return <div className="settings-toggle"><label htmlFor={id}><strong>{t(label)}</strong>{description && <small id={`${id}-description`}>{t(description)}</small>}</label><Switch id={id} aria-label={t(label)} aria-describedby={description ? `${id}-description` : undefined} checked={checked} disabled={disabled} aria-disabled={disabled || pending} onCheckedChange={(value) => { if (!pending) onChange(value); }} /></div>;
}
