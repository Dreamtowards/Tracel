"use client";

import { useEffect, useState } from "react";

/** Keep the age clock local so seconds do not trigger timeline renders. */
export default function QuotaFreshness({ sampledAt }: { sampledAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sampledAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sampledAt]);
  const seconds = sampledAt === undefined ? null : Math.max(0, Math.floor((now - sampledAt) / 1000));
  const age = seconds === null ? "暂无采样"
    : seconds < 60 ? `${seconds}秒前`
    : seconds < 3600 ? `${Math.floor(seconds / 60)}分钟前`
    : seconds < 86400 ? `${Math.floor(seconds / 3600)}小时前`
    : `${Math.floor(seconds / 86400)}天前`;
  return <time className="quota-freshness" dateTime={sampledAt === undefined ? undefined : new Date(sampledAt).toISOString()}
    title={sampledAt === undefined ? "数据源尚无采样记录" : `最近采样：${new Date(sampledAt).toLocaleString("zh-CN", { hourCycle: "h23" })}`}>({age})</time>;
}
