"use client";
import { useEffect, useState } from "react";
import { apiBase } from "./data-source/api";
import styles from "./console.module.css";
export function RadarEmbed() {
  const [summary, setSummary] = useState<{
      online: number;
      pageViews: number;
      now: number;
    } | null>(null),
    [theme, setTheme] = useState("dark"),
    [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("site") || "";
    setTheme(params.get("theme") === "light" ? "light" : "dark");
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(key) || !apiBase) {
      setError("统计暂不可用");
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(
          `${apiBase}/v1/public/sites/${key}/summary`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(12_000),
            ]),
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error();
        const value = await response.json();
        if (!controller.signal.aborted) {
          setSummary(value);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("统计暂不可用");
          setSummary(null);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 20_000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return (
    <main className={styles.embedBody} data-theme={theme} lang="zh-CN">
      <span>网站正在发生什么</span>
      {error ? (
        <p role="status">{error}</p>
      ) : (
        <div className={styles.embedNumbers}>
          <div>
            <strong>{summary?.online ?? "—"}</strong>
            <span>约在线会话</span>
          </div>
          <div>
            <strong>{summary?.pageViews ?? "—"}</strong>
            <span>24 小时浏览</span>
          </div>
        </div>
      )}
      <a href="/radar" target="_blank" rel="noopener noreferrer">
        Powered by Radar
      </a>
    </main>
  );
}
