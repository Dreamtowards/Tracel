"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Focus, Hand, Info, Maximize2, MousePointer2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { I18nProvider, MetricOverview, Timeline, clampRange, metricSampleAt, zoomRange, type Capture, type MetricKey, type MetricSample, type Range } from "@tracel/timeline";
import { quotaDemoSource } from "../../quota/demo";
import { accountStatus, quotaAccountName, quotaCapture, quotaDeadlineTone, quotaKey, quotaTimeLeft, quotaValue, type QuotaAccount, type QuotaDataset, type QuotaDataSource } from "../../quota/model";
import { quotaStatistics } from "../../quota/statistics";
import "@tracel/timeline/styles.css";
import "@tracel/timeline/desktop.css";
import "./quota.css";

const palette = { background: "#111113", grid: "#232326", divider: "#29292d", group: "#19191c", focus: "#d4d4d812", selection: "#d4d4d8", text: "#ececef", muted: "#a1a1aa" };
const appearance = { padding: 3, backgroundHeight: 16, contextOpacity: 72, durationLabels: true, currentTime: false };
const presets = [{ label: "1 小时", seconds: 3600 }, { label: "1 天", seconds: 86400 }, { label: "7 天", seconds: 7 * 86400 }, { label: "30 天", seconds: 30 * 86400 }];
const messages = { "Sample": "采样", "TRACKS": "额度轨道" };
const noFocus = () => {};

export default function QuotaApp({ source = quotaDemoSource }: { source?: QuotaDataSource }) {
  const [loaded, setLoaded] = useState<{ dataset: QuotaDataset; capture: Capture } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    source.load().then(dataset => { if (!cancelled) { setLoaded({ dataset, capture: quotaCapture(dataset) }); setError(""); } })
      .catch(() => { if (!cancelled) setError("额度历史读取失败，请重试。"); });
    return () => { cancelled = true; };
  }, [source, attempt]);
  if (!loaded) return <div className="quota-loading"><h1>Quota</h1><p role="status">{error || "正在加载…"}</p>{error && <button onClick={() => { setError(""); setAttempt(value => value + 1); }}>重新读取</button>}</div>;
  return <I18nProvider locale="zh-CN" messages={messages}><QuotaExplorer key={attempt} {...loaded} /></I18nProvider>;
}

function QuotaExplorer({ dataset, capture }: { dataset: QuotaDataset; capture: Capture }) {
  const [view, setView] = useState(capture.initialView ?? capture.bounds);
  const [selection, setSelection] = useState<Range | null>(null);
  const [metric, setMetric] = useState<MetricKey>(quotaKey(dataset.tracks[0].id));
  const [mode, setMode] = useState<"select" | "pan">("select");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const historyDays = Math.round((capture.bounds.end - capture.bounds.start) / 86400);
  const track = dataset.tracks.find(item => quotaKey(item.id) === metric)!;
  const account = dataset.accounts.find(item => item.id === track.accountId)!;
  const range = selection ?? view;
  // Settle statistics separately so drawing stays responsive during continuous zoom.
  const [statsRange, setStatsRange] = useState(range);
  useEffect(() => { const timer = setTimeout(() => setStatsRange(range), 100); return () => clearTimeout(timer); }, [range]);
  const stats = useMemo(() => quotaStatistics(capture, metric, statsRange), [capture, metric, statsRange]);
  const latest = useMemo(() => {
    for (let index = capture.metrics.length - 1; index >= 0; index--)
      if (capture.metrics[index].values?.[metric] != null) return capture.metrics[index];
    return null;
  }, [capture, metric]);
  const nextReset = dataset.resets.find(reset => reset.trackId === track.id && reset.kind === "projected" && reset.at >= dataset.endMs);
  const date = useCallback((seconds: number, detailed = false) => new Date(Date.parse(capture.epoch) + seconds * 1000).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, ...(detailed ? { second: "2-digit" as const } : {}),
  }), [capture.epoch]);
  const formatSample = useCallback((key: MetricKey, sample: MetricSample | null) => {
    const item = dataset.tracks.find(track => quotaKey(track.id) === key)!;
    const value = sample?.values?.[key] ?? null;
    return `${item.name} · ${value === null ? "缺采 · 此时没有有效读数" : `剩余 ${quotaValue(value, item)}`}${value !== null && item.capacity ? `\n${Math.round(value / 100 * item.capacity).toLocaleString("zh-CN")} / ${item.capacity.toLocaleString("zh-CN")} ${item.capacityUnit}` : ""}`;
  }, [dataset.tracks]);
  const changeView = useCallback((next: Range) => setView(clampRange(next, capture.bounds)), [capture.bounds]);
  const preset = (seconds: number) => { changeView({ start: view.end - seconds, end: view.end }); setSelection(null); };
  const pan = (direction: number) => { const delta = (view.end - view.start) * .5 * direction; changeView({ start: view.start + delta, end: view.end + delta }); };
  const zoom = (factor: number) => changeView(zoomRange(view, factor, (view.start + view.end) / 2, capture.bounds));
  const span = view.end - view.start;
  const selectedHours = (statsRange.end - statsRange.start) / 3600;
  const delta = stats.change === null ? "—" : `${stats.change > 0 ? "+" : ""}${stats.change.toFixed(1)} ${track.unit === "%" ? "个百分点" : track.unit}`;
  const resetBadge = (trackId: string) => {
    const reset = dataset.resets.find(item => item.trackId === trackId && item.kind === "projected" && item.at >= dataset.endMs);
    if (!reset) return null;
    const label = reset.at > now ? quotaTimeLeft(reset.at, now) : "待重置";
    const description = `预计重置 ${date((reset.at - dataset.startMs) / 1000)}${reset.at > now ? ` · 剩余 ${label}` : " · 等待新读数确认"}`;
    return <span className={`quota-badge quota-reset-badge quota-deadline-${quotaDeadlineTone(reset.at, now)}`} title={description} aria-label={description}><RotateCcw size={10} />{label}</span>;
  };
  const resetCreditsBadge = (item: QuotaAccount) => {
    if (item.resetsRemaining === undefined) return null;
    const expiresAt = item.resetsRemaining > 0 ? item.resetExpiresAtMs : undefined;
    const remaining = expiresAt === undefined ? null : expiresAt > now ? quotaTimeLeft(expiresAt, now) : "已过期";
    const description = `当前可用 Reset ${item.resetsRemaining} 次${expiresAt !== undefined ? ` · 最早过期 ${date((expiresAt - dataset.startMs) / 1000)} · ${remaining}` : item.resetsRemaining > 0 ? " · 未提供过期时间" : ""}`;
    return <span className={`quota-badge quota-reset-count quota-deadline-${quotaDeadlineTone(expiresAt, now)}`} title={description} aria-label={description}><RotateCcw size={10} />{item.resetsRemaining}{remaining && <span className="quota-expiry-time">· {remaining}</span>}</span>;
  };
  return <div className="desktop-ui quota-root" style={{ "--ui-scale": 1 } as CSSProperties}>
    <div className="tx-app quota-app">
      <main className="tx-main tx-main-timeline quota-main">
        <header className="tx-toolbar quota-toolbar" aria-label="时间轴工具栏">
          <a className="quota-brand" href="/quota"><h1>Quota</h1></a>
          <div className="quota-toolbar-actions">
          <div className="tx-segmented">{presets.map(item => <button key={item.label} className={Math.abs(span - item.seconds) < 1 ? "active" : ""} aria-pressed={Math.abs(span - item.seconds) < 1} onClick={() => preset(item.seconds)}>{item.label}</button>)}</div>
          <div className="quota-toolbar-group"><button className="tx-icon-button" aria-label="向前平移" onClick={() => pan(-1)}><ChevronLeft size={16} /></button><button className="tx-icon-button" aria-label="向后平移" onClick={() => pan(1)}><ChevronRight size={16} /></button></div>
          <button className="tx-icon-button" aria-label="放大时间轴" onClick={() => zoom(1 / 1.5)}><ZoomIn size={16} /></button><button className="tx-icon-button" aria-label="缩小时间轴" onClick={() => zoom(1.5)}><ZoomOut size={16} /></button>
          <button className="tx-button" onClick={() => { changeView(capture.bounds); setSelection(null); }}><Maximize2 size={13} />全部历史</button>
          <div className="tx-toolbar-space" />
          <div className="tx-segmented"><button className={mode === "select" ? "active" : ""} aria-label="选区模式" aria-pressed={mode === "select"} onClick={() => setMode("select")}><MousePointer2 size={14} />选区</button><button className={mode === "pan" ? "active" : ""} aria-label="平移模式" aria-pressed={mode === "pan"} onClick={() => setMode("pan")}><Hand size={14} />平移</button></div>
          <button className="tx-button" onClick={() => { changeView(capture.initialView!); setSelection(null); }}><RotateCcw size={13} />最近一天</button>
          </div>
          <div className="quota-header-end"><span className="quota-header-meta">{dataset.mode === "demo" ? "示例 · " : ""}{dataset.accounts.length} 个账号 · {dataset.tracks.length} 条额度</span>
            <div className="quota-info"><button className="tx-icon-button" aria-label="页面信息" aria-describedby="quota-info-content"><Info size={15} /></button><div className="quota-info-content" id="quota-info-content" role="tooltip"><p>{dataset.mode === "demo" ? "所有账号、套餐和读数均为模拟，未连接真实账号。" : dataset.label}</p><p>{historyDays} 天历史 · 每 {dataset.samplePeriodSeconds / 60} 分钟采样 · {dataset.accounts.length} 个账号 · {dataset.tracks.length} 条额度</p><p>滚轮缩放，Shift + 滚轮或 Alt + 拖动平移；拖动选区，Esc 清除。</p><p>循环图标旁的时长表示距离重置；次数标签的时长表示距最早过期。悬停查看具体时间。</p><p>虚线表示重置，留空表示缺采。更新于 {date(capture.bounds.end)}。</p></div></div>
            <a href="/timeline">Tracel</a>
          </div>
        </header>
        <section className="tx-overview" aria-label="长期额度总览">
          <div className="tx-overview-heading"><label className="quota-overview-select">长期总览<select aria-label="总览额度轨道" value={metric} onChange={event => setMetric(event.target.value as MetricKey)}>{dataset.tracks.map(item => <option key={item.id} value={quotaKey(item.id)}>{quotaAccountName(dataset.accounts.find(account => account.id === item.accountId)!)} · {item.name}</option>)}</select><ChevronRight size={13} /></label><span>{date(capture.bounds.start)} — {date(capture.bounds.end)}<b>{historyDays} 天</b></span></div>
          <MetricOverview data={capture} metric={metric} view={view} onView={changeView} />
        </section>
        <div className="tx-content">
          <section className="tx-timeline-panel" aria-label="额度主时间轴">
            <div className="tx-timeline-heading"><span><small data-quota-view>{date(view.start, true)} — {date(view.end, true)}</small></span></div>
            <Timeline data={capture} view={view} selection={selection} mode={mode} focus={null} appearance={appearance} palette={palette} onView={changeView} onSelect={setSelection} onFocus={noFocus} activeMetric={metric} onMetricFocus={setMetric} formatMetricSample={formatSample} initialLabelWidth={280}
              renderTrackLabel={row => {
                const item = row.kind === "group" ? dataset.accounts.find(item => `account:${item.id}` === row.id) : undefined;
                if (item) return <span className="quota-account-label"><span className="quota-account-name" title={quotaAccountName(item)}>{quotaAccountName(item)}</span><span className={`quota-badge quota-status quota-status-${item.status}`}>{accountStatus[item.status]}</span>{resetCreditsBadge(item)}</span>;
                return <span className="quota-lane-label"><span className="quota-lane-name">{row.name}</span>{resetBadge(row.id)}{row.subtitle && <small>{row.subtitle}</small>}</span>;
              }} />
          </section>
          <aside className="tx-inspector quota-inspector" aria-label="额度详情">
            <div className="tx-inspector-title"><span><Focus size={15} />{selection ? "选区详情" : "范围详情"}</span>{selection && <button className="tx-icon-button" aria-label="清除选区" onClick={() => setSelection(null)}><X size={14} /></button>}</div>
            <div className="quota-inspector-scroll">
              <section className="quota-account-info"><span className="quota-kicker">当前账号</span><h2>{quotaAccountName(account)}<span className={`quota-badge quota-status quota-status-${account.status}`}>{accountStatus[account.status]}</span></h2><h3 style={{ color: track.color }}>{track.name}</h3><div className="quota-current">{quotaValue(latest?.values?.[metric] ?? null, track)}</div><p>{latest ? `最后有效采样 ${date(latest.time)}` : "尚无有效采样"}</p>{latest && !metricSampleAt(capture, capture.bounds.end - .001, metric) && <p className="quota-stale">当前读数缺失，以上为上次有效值</p>}
                {nextReset && <p>{resetBadge(track.id)}</p>}{account.resetsRemaining !== undefined && <p>{resetCreditsBadge(account)}</p>}
              </section>
              <section className="quota-range-info" aria-busy={range.start !== statsRange.start || range.end !== statsRange.end}>
                <span className="quota-kicker">{selection ? "选中时段" : "可见时段"}</span><h3>{selectedHours >= 24 ? `${(selectedHours / 24).toFixed(1)} 天` : selectedHours >= 1 ? `${selectedHours.toFixed(1)} 小时` : `${(selectedHours * 60).toFixed(1)} 分钟`}</h3><p>{date(statsRange.start)}<br />{date(statsRange.end)}</p>
                {selection && <button className="tx-button" onClick={() => { changeView(selection); setSelection(null); }}><ZoomIn size={13} />放大到选区</button>}
                <dl><div><dt>起始读数</dt><dd>{quotaValue(stats.first, track)}</dd></div><div><dt>末尾读数</dt><dd>{quotaValue(stats.last, track)}</dd></div><div><dt>读数变化</dt><dd>{delta}</dd></div><div><dt>最低剩余</dt><dd>{quotaValue(stats.minimum, track)}</dd></div><div><dt>有效覆盖</dt><dd>{(stats.coverage * 100).toFixed(1)}%</dd></div><div><dt>已确认重置</dt><dd>{stats.resets} 次</dd></div></dl>
                <p className="quota-explanation">变化包含周期重置。缺采留空；0% 表示已用尽。点按左侧额度行可切换总览与详情。</p>
              </section>
            </div>
          </aside>
        </div>
      </main>
    </div>
  </div>;
}
