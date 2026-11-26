"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Eraser, Focus, Hand, Info, Maximize2, MousePointer2, PanelRightClose, PanelRightOpen, Radio, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { I18nProvider, MetricOverview, Timeline, clampRange, constrainOverviewRange, followRange, metricSampleAt, zoomRange, type Capture, type MetricKey, type MetricSample, type Range } from "@tracel/timeline";
import DatePicker from "@tracel/timeline/desktop/DatePicker";
import { useDesktopTheme } from "@tracel/timeline/desktop/DesktopExplorer";
import { quotaDemoSource } from "../../quota/demo";
import { accountStatus, quotaAccountName, quotaCapture, quotaDeadlineTone, quotaKey, quotaTimeLeft, quotaValue, type QuotaAccount, type QuotaDataset, type QuotaDataSource } from "../../quota/model";
import { quotaStatistics } from "../../quota/statistics";
import { quotaDateKey, quotaDayRange, quotaDuration, quotaRangeLabel } from "../../quota/time";
import "@tracel/timeline/styles.css";
import "@tracel/timeline/desktop.css";
import "./quota.css";

const palette = { background: "#111113", grid: "#232326", divider: "#29292d", group: "#19191c", focus: "#d4d4d812", selection: "#d4d4d8", text: "#ececef", muted: "#a1a1aa" };
const appearance = { padding: 3, backgroundHeight: 16, contextOpacity: 72, durationLabels: true, currentTime: false };
const presets = [{ label: "1 小时", seconds: 3600 }, { label: "1 天", seconds: 86400 }, { label: "7 天", seconds: 7 * 86400 }, { label: "30 天", seconds: 30 * 86400 }];
const messages = { "Sample": "采样", "TRACKS": "额度轨道", "Capture date": "日期", "Choose capture date": "选择日期", "Overview time range": "总览时间范围", "Scroll to zoom overview; Shift-scroll to pan": "滚轮缩放总览跨度；Shift + 滚轮平移总览" };
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
  useDesktopTheme("#d4d4d8", 100, "zh-CN");
  const [view, setView] = useState(capture.initialView ?? capture.bounds);
  const [overviewRange, setOverviewRange] = useState(capture.bounds);
  const overviewBounds = useMemo(() => constrainOverviewRange(overviewRange, view, capture.bounds), [overviewRange, view, capture.bounds]);
  useEffect(() => { setOverviewRange(overviewBounds); }, [overviewBounds]);
  const [inspector, setInspector] = useState(true);
  const [selection, setSelection] = useState<Range | null>(null);
  const [metric, setMetric] = useState<MetricKey>(quotaKey(dataset.tracks[0].id));
  const [mode, setMode] = useState<"select" | "pan">("pan");
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (following) setView(current => followRange(current, capture.bounds.end, capture.bounds));
  }, [capture, following]);
  const timelineData = useMemo(() => ({ ...capture, metricMarkers: capture.metricMarkers?.filter(marker => marker.kind !== "confirmed") }), [capture]);
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
  const date = useCallback((seconds: number) => new Date(Date.parse(capture.epoch) + seconds * 1000).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }), [capture.epoch]);
  const formatSample = useCallback((key: MetricKey, sample: MetricSample | null) => {
    const item = dataset.tracks.find(track => quotaKey(track.id) === key)!;
    const value = sample?.values?.[key] ?? null;
    return `${item.name} · ${value === null ? "缺采 · 此时没有有效读数" : `剩余 ${quotaValue(value, item)}`}${value !== null && item.capacity ? `\n${Math.round(value / 100 * item.capacity).toLocaleString("zh-CN")} / ${item.capacity.toLocaleString("zh-CN")} ${item.capacityUnit}` : ""}`;
  }, [dataset.tracks]);
  const changeView = useCallback((next: Range) => { setFollowing(false); setView(clampRange(next, capture.bounds)); }, [capture.bounds]);
  const preset = (seconds: number) => { changeView({ start: view.end - seconds, end: view.end }); setSelection(null); };
  const originMs = Date.parse(capture.epoch);
  const dateValue = quotaDateKey(originMs + view.start * 1000);
  const firstDate = quotaDateKey(originMs + capture.bounds.start * 1000), lastDate = quotaDateKey(originMs + capture.bounds.end * 1000 - 1);
  const chooseDate = (value: string) => { changeView(quotaDayRange(value, capture.epoch, capture.bounds)); setSelection(null); };
  const shiftDate = (offset: number) => {
    const day = new Date(`${dateValue}T12:00:00`); day.setDate(day.getDate() + offset);
    chooseDate(quotaDateKey(day.getTime()));
  };
  const zoom = (factor: number) => changeView(zoomRange(view, factor, (view.start + view.end) / 2, capture.bounds));
  const span = view.end - view.start;
  const delta = stats.change === null ? "—" : `${stats.change > 0 ? "+" : ""}${stats.change.toFixed(1)} ${track.unit === "%" ? "个百分点" : track.unit}`;
  const resetBadge = (trackId: string) => {
    const reset = dataset.resets.find(item => item.trackId === trackId && item.kind === "projected" && item.at >= dataset.endMs);
    if (!reset) return null;
    const label = reset.at > now ? quotaTimeLeft(reset.at, now) : "待重置";
    const description = `预计重置 ${date((reset.at - dataset.startMs) / 1000)}${reset.at > now ? ` · 剩余 ${label}` : " · 等待新读数确认"}`;
    return <span className={`quota-badge quota-reset-badge quota-deadline-${reset.at > now ? quotaDeadlineTone(reset.at, now) : "muted"}`} title={description} aria-label={description}><RotateCcw size={10} />{label}</span>;
  };
  const resetCreditsBadge = (item: QuotaAccount) => {
    if (item.resetsRemaining === undefined) return null;
    const expiresAt = item.resetsRemaining > 0 ? item.resetExpiresAtMs : undefined;
    const remaining = expiresAt === undefined ? null : expiresAt > now ? quotaTimeLeft(expiresAt, now) : "已过期";
    const description = `当前可用 Reset ${item.resetsRemaining} 次${expiresAt !== undefined ? ` · 最早过期 ${date((expiresAt - dataset.startMs) / 1000)} · ${remaining}` : item.resetsRemaining > 0 ? " · 未提供过期时间" : ""}`;
    return <span className={`quota-badge quota-reset-count quota-deadline-${quotaDeadlineTone(expiresAt, now)}`} title={description} aria-label={description}><RotateCcw size={10} />{item.resetsRemaining}{remaining && <span className="quota-expiry-time">· {remaining}</span>}</span>;
  };
  const informationTip = <div className="quota-info">
    <button className="tx-icon-button" aria-label="页面信息" aria-describedby="quota-info-content"><Info size={15} /></button>
    <div className="quota-info-content" id="quota-info-content" role="tooltip">
      <p>{dataset.mode === "demo" ? "所有账号、套餐和读数均为模拟，未连接真实账号。" : dataset.label}</p>
      <p>{historyDays} 天历史 · 每 {dataset.samplePeriodSeconds / 60} 分钟采样 · {dataset.accounts.length} 个账号 · {dataset.tracks.length} 条额度</p>
      <p>默认拖动平移；滚轮缩放，切换选区图标后拖动选择，Esc 清除。</p>
      <p>在总览上滚轮缩放总览跨度，Shift + 滚轮平移；主图选中的时段保持不变。</p>
      <p>“最新”跟随当前数据源提供的最新记录；手动浏览历史时暂停。</p>
      <p>循环图标旁的时长表示距离重置；次数标签的时长表示距最早过期。悬停查看具体时间。</p>
      <p>留空表示缺采。更新于 {date(capture.bounds.end)}。</p>
    </div>
  </div>;
  return <div className="desktop-ui quota-root" style={{ "--ui-scale": 1 } as CSSProperties}>
    <div className="tx-app quota-app">
      <main className="tx-main tx-main-timeline quota-main">
        <header className="tx-toolbar quota-toolbar" aria-label="时间轴工具栏">
          <div className="quota-toolbar-actions">
          <div className="tx-date-controls"><button className="tx-icon-button" aria-label="前一天" title="前一天" disabled={dateValue <= firstDate} onClick={() => shiftDate(-1)}><ChevronLeft size={15} /></button><DatePicker value={dateValue} min={firstDate} max={lastDate} onChange={chooseDate} /><button className="tx-icon-button" aria-label="后一天" title="后一天" disabled={dateValue >= lastDate} onClick={() => shiftDate(1)}><ChevronRight size={15} /></button></div>
          <div className="tx-separator" />
          <div className="tx-segmented">{presets.map(item => <button key={item.label} className={Math.abs(span - item.seconds) < 1 ? "active" : ""} aria-pressed={Math.abs(span - item.seconds) < 1} onClick={() => preset(item.seconds)}>{item.label}</button>)}</div>
          <button className="tx-text-button quota-follow" aria-label="跟随最新记录" aria-pressed={following} title={following ? "暂停跟随最新记录" : "定位最新记录并跟随数据更新"} onClick={() => { setSelection(null); setFollowing(value => !value); }}><Radio size={14} opacity={following ? 1 : .35} />最新</button>
          </div>
          <div className="quota-header-end">
          {informationTip}
          <div className="quota-toolbar-tools">
          <div className="tx-segmented quota-modes"><button className={mode === "select" ? "active" : ""} aria-label="选区模式" title="选择时间范围" aria-pressed={mode === "select"} onClick={() => setMode("select")}><MousePointer2 size={14} /></button><button className={mode === "pan" ? "active" : ""} aria-label="平移模式" title="平移时间轴" aria-pressed={mode === "pan"} onClick={() => setMode("pan")}><Hand size={14} /></button></div>
          <div className="tx-separator" />
          <button className="tx-icon-button" aria-label="放大时间轴" onClick={() => zoom(1 / 1.5)}><ZoomIn size={16} /></button><button className="tx-icon-button" aria-label="缩小时间轴" onClick={() => zoom(1.5)}><ZoomOut size={16} /></button>
          <button className="tx-icon-button" aria-label="全部历史" title="显示全部历史" onClick={() => { changeView(capture.bounds); setSelection(null); }}><Maximize2 size={15} /></button>
          </div>
            <button className="tx-icon-button" aria-label={inspector ? "收起范围详情" : "展开范围详情"} title={inspector ? "收起范围详情" : "展开范围详情"} aria-expanded={inspector} aria-controls="quota-inspector" onClick={() => setInspector(value => !value)}>{inspector ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>
          </div>
        </header>
        <section className="tx-overview" aria-label="额度总览">
          <div className="tx-overview-heading"><label className="quota-overview-select">总览<select aria-label="总览额度轨道" value={metric} onChange={event => setMetric(event.target.value as MetricKey)}>{dataset.tracks.map(item => <option key={item.id} value={quotaKey(item.id)}>{quotaAccountName(dataset.accounts.find(account => account.id === item.accountId)!)} · {item.name}</option>)}</select><ChevronDown size={13} /></label><span data-quota-overview-range>{quotaRangeLabel(capture.epoch, overviewBounds)}<b>{quotaDuration(overviewBounds.end - overviewBounds.start)}</b></span></div>
          <MetricOverview data={capture} metric={metric} bounds={overviewBounds} onBoundsChange={setOverviewRange} view={view} onView={changeView} calendar />
        </section>
        <div className="tx-content">
          <section className="tx-timeline-panel" aria-label="额度主时间轴">
            <div className="tx-timeline-heading"><span><small data-quota-view>{quotaRangeLabel(capture.epoch, view)}</small><span className="quota-range-duration">{quotaDuration(span)}</span></span>{!inspector && <button className="tx-icon-button" aria-label="打开范围详情" title="打开范围详情" aria-expanded={false} aria-controls="quota-inspector" onClick={() => setInspector(true)}><PanelRightOpen size={16} /></button>}</div>
            <Timeline data={timelineData} view={view} selection={selection} mode={mode} focus={null} appearance={appearance} palette={palette} onView={changeView} onSelect={next => { setSelection(next); if (next) setFollowing(false); }} onFocus={noFocus} activeMetric={metric} onMetricFocus={setMetric} formatMetricSample={formatSample} initialLabelWidth={280}
              renderTrackLabel={row => {
                const item = row.kind === "group" ? dataset.accounts.find(item => `account:${item.id}` === row.id) : undefined;
                if (item) return <span className="quota-account-label"><span className="quota-account-name" title={quotaAccountName(item)}>{quotaAccountName(item)}</span>{resetCreditsBadge(item)}<span className={`quota-badge quota-status quota-status-${item.status}`}>{accountStatus[item.status]}</span></span>;
                return <span className="quota-lane-label"><span className="quota-lane-name">{row.name}</span>{resetBadge(row.id)}{row.subtitle && <small>{row.subtitle}</small>}</span>;
              }} />
          </section>
          {inspector && <aside id="quota-inspector" className="tx-inspector quota-inspector" aria-label="额度详情">
            <div className="tx-inspector-title"><span><Focus size={15} />{selection ? "选区详情" : "范围详情"}</span><div className="quota-inspector-actions">{selection && <button className="tx-icon-button" aria-label="清除选区" title="清除选区" onClick={() => setSelection(null)}><Eraser size={14} /></button>}<button className="tx-icon-button" aria-label="关闭范围详情" title="关闭范围详情" onClick={() => setInspector(false)}><X size={14} /></button></div></div>
            <div className="quota-inspector-scroll">
              <section className="quota-account-info"><span className="quota-kicker">当前账号</span><h2>{quotaAccountName(account)}<span className={`quota-badge quota-status quota-status-${account.status}`}>{accountStatus[account.status]}</span></h2><h3 style={{ color: track.color }}>{track.name}</h3><div className="quota-current">{quotaValue(latest?.values?.[metric] ?? null, track)}</div><p>{latest ? `最后有效采样 ${date(latest.time)}` : "尚无有效采样"}</p>{latest && !metricSampleAt(capture, capture.bounds.end - .001, metric) && <p className="quota-stale">当前读数缺失，以上为上次有效值</p>}
                {nextReset && <p>{resetBadge(track.id)}</p>}{account.resetsRemaining !== undefined && <p>{resetCreditsBadge(account)}</p>}
              </section>
              <section className="quota-range-info" aria-busy={range.start !== statsRange.start || range.end !== statsRange.end}>
                <span className="quota-kicker">{selection ? "选中时段" : "可见时段"}</span><h3>{quotaDuration(statsRange.end - statsRange.start)}</h3><p>{quotaRangeLabel(capture.epoch, statsRange)}</p>
                {selection && <button className="tx-button" onClick={() => { changeView(selection); setSelection(null); }}><ZoomIn size={13} />放大到选区</button>}
                <dl><div><dt>起始读数</dt><dd>{quotaValue(stats.first, track)}</dd></div><div><dt>末尾读数</dt><dd>{quotaValue(stats.last, track)}</dd></div><div><dt>读数变化</dt><dd>{delta}</dd></div><div><dt>最低剩余</dt><dd>{quotaValue(stats.minimum, track)}</dd></div><div><dt>有效覆盖</dt><dd>{(stats.coverage * 100).toFixed(1)}%</dd></div></dl>
                <p className="quota-explanation">变化包含周期重置。缺采留空；0% 表示已用尽。点按左侧额度行可切换总览与详情。</p>
              </section>
            </div>
          </aside>}
        </div>
      </main>
    </div>
  </div>;
}
