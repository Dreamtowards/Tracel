import type { QuotaDataset, QuotaDataSource, QuotaTrack } from "./model";

const DAY = 86400;
const colors = ["#93b4f5", "#9ec7f0", "#c4a7ee", "#7dd3c9", "#a3c88c", "#edc17b", "#d6a0c7"];

/** Seeded random data, rounded to a five-minute boundary; no account access. */
export function createQuotaDemo(now = Date.now(), seed = 42): QuotaDataset {
  const endMs = Math.floor(now / 300000) * 300000;
  const startMs = endMs - 30 * DAY * 1000;
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const accounts: QuotaDataset["accounts"] = [
    { id: "gpt-1", name: "GPT 1", provider: "OpenAI", plan: "Pro", status: "enabled", resetsRemaining: 0 },
    { id: "gpt-2", name: "GPT 2", provider: "OpenAI", plan: "Pro Lite", status: "draining", resetsRemaining: 3, resetExpiresAtMs: endMs + (2 * DAY + 4 * 3600) * 1000 },
    { id: "kimi-1", name: "Kimi 1", provider: "Kimi", plan: "Coding", status: "enabled" },
    { id: "glm-1", name: "GLM 1", provider: "GLM", plan: "MAX", status: "draining" },
    { id: "deepseek-1", name: "DeepSeek 1", provider: "DeepSeek", plan: "", status: "enabled" },
    { id: "eleven-1", name: "ElevenLabs 1", provider: "ElevenLabs", plan: "Free", status: "enabled" },
    { id: "tripo-1", name: "Tripo 1", provider: "Tripo", plan: "", status: "disabled" },
  ];
  const specs: { track: QuotaTrack; period: number; phase: number }[] = [];
  const add = (id: string, accountId: string, name: string, period: number, phase: number, color: string, extra: Partial<QuotaTrack> = {}) =>
    specs.push({ track: { id, accountId, name, unit: "%", max: 100, color, ...extra }, period, phase });
  add("codex-1-week", "gpt-1", "Codex · 每周", 7 * DAY, 2 * DAY, colors[0], { capacity: 2000000, capacityUnit: "tokens" });
  add("codex-2-week", "gpt-2", "Codex · 每周", 7 * DAY, 4 * DAY, colors[1]);
  add("kimi-5h", "kimi-1", "Kimi · 5 小时", 18000, 7200, colors[2]);
  add("kimi-week", "kimi-1", "Kimi · 每周", 7 * DAY, DAY, colors[2]);
  add("glm-5h", "glm-1", "模型 · 5 小时", 18000, 0, colors[3]);
  add("glm-week", "glm-1", "模型 · 每周", 7 * DAY, 3 * DAY, colors[3]);
  add("glm-tools", "glm-1", "工具 / MCP · 每周", 7 * DAY, DAY, colors[3]);
  add("deepseek-balance", "deepseek-1", "API 余额", 0, 0, colors[4], { unit: "CNY", max: 500 });
  add("eleven-month", "eleven-1", "音效 / 音乐 · 每月", 30 * DAY, 10 * DAY, colors[5], { capacity: 10000, capacityUnit: "credits" });
  add("tripo-credits", "tripo-1", "Usage credits", 0, 0, colors[6], { unit: "credits", max: 15000 });
  const values = specs.map(({ track, period, phase }) => period ? 100 * (1 - phase / period) : track.max);
  const resets: QuotaDataset["resets"] = [];
  const samples: QuotaDataset["samples"] = [];
  for (let time = 0; time < 30 * DAY; time += 300) {
    const hour = new Date(startMs + time * 1000).getUTCHours();
    const intensity = hour >= 1 && hour <= 15 ? 1.8 : .08;
    const readings: Record<string, number | null> = {};
    specs.forEach(({ track, period, phase }, i) => {
      if (period && time > 0 && (time + phase) % period === 0) {
        values[i] = 100;
        resets.push({ id: `${track.id}:${time}`, trackId: track.id, at: startMs + time * 1000, kind: "confirmed" });
      } else values[i] = Math.max(0, values[i] - intensity * (.2 + random() * 1.8) * (period ? 300 / period * 115 : track.max / 22000));
      if (track.id === "glm-week" && time >= 28 * DAY) values[i] = 0;
      const gap = track.id === "kimi-week" && time >= 29 * DAY + 3600 * 5 && time < 29 * DAY + 3600 * 8;
      const disabled = track.id === "tripo-credits" && time >= 29 * DAY;
      readings[track.id] = gap || disabled ? null : Math.round(values[i] * 100) / 100;
    });
    samples.push({ at: startMs + time * 1000, values: readings });
  }
  for (const { track, period, phase } of specs) {
    if (!period) continue;
    const next = Math.ceil((30 * DAY + phase) / period) * period - phase;
    resets.push({ id: `${track.id}:next`, trackId: track.id, at: startMs + next * 1000, kind: "projected" });
  }
  return { mode: "demo", label: "30 天模拟数据", startMs, endMs, samplePeriodSeconds: 300, accounts, tracks: specs.map(spec => spec.track), samples, resets };
}

export const quotaDemoSource: QuotaDataSource = { async load() { return createQuotaDemo(); } };
