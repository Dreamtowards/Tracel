"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Site, Snapshot, StoredEvent } from "@tracel/radar-contracts";
import { radarAuth } from "./auth";
import { apiBase, radarApi, getSnapshot, getJourney } from "./data-source/api";
import { RadarView } from "@/components/radar/RadarView";
import styles from "./console.module.css";

export function RadarConsole() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [sites, setSites] = useState<Site[]>([]),
    [siteId, setSiteId] = useState(""),
    [name, setName] = useState(""),
    [domains, setDomains] = useState(""),
    [draftDomains, setDraftDomains] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [journey, setJourney] = useState<{
      events: StoredEvent[];
      truncated: boolean;
    } | null>(null),
    [visitor, setVisitor] = useState(""),
    [showMap, setShowMap] = useState(false),
    [host, setHost] = useState("");
  const site = sites.find((s) => s.id === siteId);
  const token = session?.access_token || "";
  useEffect(() => {
    setHost(window.location.origin);
    const auth = radarAuth();
    if (!auth) {
      setReady(true);
      return;
    }
    void auth.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setReady(true);
    });
    const { data } = auth.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSnapshot(null);
      setJourney(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!token) {
      setSites([]);
      setSiteId("");
      return;
    }
    const controller = new AbortController();
    void radarApi<Site[]>("/sites", token, {}, controller.signal)
      .then((rows) => {
        setSites(rows);
        setSiteId((current) =>
          rows.some((s) => s.id === current) ? current : rows[0]?.id || "",
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [token]);
  useEffect(() => {
    setDraftDomains(site?.domains.join(", ") || "");
    setSnapshot(null);
    setJourney(null);
    setVisitor("");
    if (!site || !token) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await getSnapshot(site, token, controller.signal);
        if (!controller.signal.aborted) {
          setSnapshot(data);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setError(e instanceof Error ? e.message : "请求失败");
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 15_000);
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [site?.id, token]);
  useEffect(() => {
    setJourney(null);
    if (!visitor || !site || !token) return;
    const controller = new AbortController();
    void getJourney(site, token, visitor, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setJourney(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [visitor, site?.id, token]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const update = async (value: Partial<Site>) => {
    if (!site) return;
    await run(async () => {
      const rows = await radarApi<Site[]>(`/sites/${site.id}`, token, {
        method: "PATCH",
        body: JSON.stringify(value),
      });
      setSites((current) =>
        current.map((s) => (s.id === site.id ? rows[0] : s)),
      );
      setMessage("网站设置已保存");
    });
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("已复制");
    } catch {
      setMessage("请选中代码手动复制");
    }
  };
  const trackerCode = site
    ? `<script async src="${host}/radar/tracker.js" data-site="${site.site_key}" data-endpoint="${apiBase}/v1/collect"></script>`
    : "";
  const embedUrl = site
    ? `${host}/radar/embed?site=${site.site_key}&theme=${site.theme}`
    : "";
  const embedCode = `<iframe title="网站访问统计" src="${embedUrl}" width="320" height="150" style="border:0" loading="lazy"></iframe>`;
  const ranks = (label: string, rows: { name: string; count: number }[]) => (
    <section className={styles.card}>
      <h2>{label}</h2>
      {rows.length ? (
        <ul className={styles.list}>
          {rows.map((r) => (
            <li key={r.name}>
              <span>{r.name}</span>
              <strong>{r.count}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>暂无数据</p>
      )}
    </section>
  );
  if (showMap && site && token)
    return (
      <div className={styles.map}>
        <RadarView source={{ site, token }} />
        <button className={styles.back} onClick={() => setShowMap(false)}>
          返回后台
        </button>
      </div>
    );
  return (
    <main className={styles.console} lang="zh-CN">
      <header className={styles.header}>
        <div>
          <h1>RADAR</h1>
          <p className={styles.muted}>看见网站正在发生什么</p>
        </div>
        <div className={styles.row}>
          <a href="/radar/demo">体验演示</a>
          <a href="/">Tracel</a>
          {session && (
            <button
              onClick={() =>
                void run(async () => {
                  const result = await radarAuth()!.auth.signOut();
                  if (result.error) throw result.error;
                })
              }
            >
              退出登录
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!apiBase ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? (
        <section className={styles.card}>
          <h2>Radar 尚未连接服务</h2>
          <p>
            配置 Radar API 与 Supabase
            后即可开始接入网站。当前没有采集真实流量。
          </p>
          <p className={styles.muted}>
            开发配置见仓库 docs/radar-development.md；演示入口仍可使用。
          </p>
        </section>
      ) : !ready ? (
        <p role="status">正在恢复登录…</p>
      ) : !session ? (
        <section className={styles.card}>
          <h2>站长登录 / 注册</h2>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await radarAuth()!.auth.signInWithOtp({
                  email,
                  options: {
                    emailRedirectTo: `${window.location.origin}/radar`,
                  },
                });
                if (result.error) throw result.error;
                setMessage("登录链接已发送，请检查邮箱。首次登录会创建账号。");
              });
            }}
          >
            <label>
              邮箱
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button disabled={busy}>发送登录链接</button>
          </form>
        </section>
      ) : (
        <>
          <section className={styles.card}>
            <div className={styles.row}>
              <label>
                网站
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                >
                  <option value="" disabled>
                    选择网站
                  </option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className={styles.muted}>{session.user.email}</span>
              {site && (
                <button onClick={() => setShowMap(true)}>
                  打开实时地图 / 地球仪
                </button>
              )}
            </div>
          </section>
          <details className={styles.card} open={!sites.length}>
            <summary>添加网站</summary>
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const created = await radarApi<Site>("/sites", token, {
                    method: "POST",
                    body: JSON.stringify({
                      name,
                      domains: domains
                        .split(",")
                        .map((v) => v.trim().toLowerCase())
                        .filter(Boolean),
                    }),
                  });
                  setSites((current) => [...current, created]);
                  setSiteId(created.id);
                  setName("");
                  setDomains("");
                  setMessage("网站已创建，请安装采集脚本。");
                });
              }}
            >
              <label>
                网站名称
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                允许的域名（逗号分隔，不含协议、端口或路径）
                <input
                  required
                  placeholder="example.com, www.example.com"
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                />
              </label>
              <button disabled={busy}>创建网站</button>
            </form>
          </details>
          {site && (
            <>
              <div className={styles.grid}>
                {[
                  ["约在线会话", snapshot?.summary.online],
                  ["24 小时浏览量", snapshot?.summary.pageViews],
                  ["24 小时独立访客", snapshot?.summary.visitors],
                ].map(([label, value]) => (
                  <section className={styles.card} key={String(label)}>
                    <span>{label}</span>
                    <strong className={styles.number}>{value ?? "—"}</strong>
                  </section>
                ))}
              </div>
              <p className={styles.muted}>
                在线：最近 60 秒有活动的可见页面会话，每 15 秒刷新。历史明细保留
                30 天。
                {snapshot &&
                  `最近更新 ${new Date(snapshot.summary.now).toLocaleTimeString()}`}
              </p>
              <details className={styles.card}>
                <summary>安装与公开组件</summary>
                <label>
                  允许的域名
                  <input
                    value={draftDomains}
                    onChange={(e) => setDraftDomains(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    void update({
                      domains: draftDomains
                        .split(",")
                        .map((v) => v.trim().toLowerCase())
                        .filter(Boolean),
                    })
                  }
                >
                  保存域名
                </button>
                <h2>采集脚本</h2>
                <code className={styles.code}>{trackerCode}</code>
                <button onClick={() => void copy(trackerCode)}>复制脚本</button>
                <p className={styles.muted}>
                  在取得本站要求的同意后加载。自定义事件：window.radar?.track('signup_clicked',{" "}
                  {"{"}plan: 'free'{"}"}
                  )；停止采集：window.radar?.stop()。请勿发送个人信息。
                </p>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={site.public_enabled}
                    onChange={(e) =>
                      void update({ public_enabled: e.target.checked })
                    }
                  />
                  公开在线人数与浏览量
                </label>
                <label>
                  组件主题
                  <select
                    value={site.theme}
                    disabled={busy}
                    onChange={(e) =>
                      void update({ theme: e.target.value as Site["theme"] })
                    }
                  >
                    <option value="dark">深色</option>
                    <option value="light">浅色</option>
                  </select>
                </label>
                {site.public_enabled && (
                  <>
                    <code className={styles.code}>{embedCode}</code>
                    <button onClick={() => void copy(embedCode)}>
                      复制 iframe
                    </button>
                    <p>组件预览</p>
                    <iframe
                      className={styles.embed}
                      title="Radar 组件预览"
                      src={embedUrl}
                    />
                  </>
                )}
              </details>
              {snapshot ? (
                <>
                  <div className={styles.grid}>
                    {ranks("24 小时页面浏览", snapshot.pages)}
                    {ranks("24 小时页面来源", snapshot.sources)}
                    {ranks("24 小时会话国家", snapshot.countries)}
                    {ranks("24 小时会话城市", snapshot.cities)}
                  </div>
                  <section className={styles.card}>
                    <h2>最近事件</h2>
                    {snapshot.truncated && (
                      <p className={styles.muted}>
                        列表仅展示最近 200 条事件 / 会话；上方统计为完整 24
                        小时范围。
                      </p>
                    )}
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>时间</th>
                            <th>匿名访客</th>
                            <th>事件</th>
                            <th>页面</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.events.map((e) => (
                            <tr key={e.event_id}>
                              <td>
                                {new Date(e.occurred_at).toLocaleString()}
                              </td>
                              <td>
                                <button
                                  onClick={() => setVisitor(e.visitor_id)}
                                >
                                  {e.visitor_id.slice(0, 8)}
                                </button>
                              </td>
                              <td>{e.name || e.type}</td>
                              <td>{e.pathname}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!snapshot.events.length && (
                      <p>
                        等待网站的第一次访问。安装脚本后，在允许的域名打开页面。
                      </p>
                    )}
                  </section>
                </>
              ) : (
                !error && <p role="status">正在读取真实流量…</p>
              )}
              {visitor && (
                <section className={styles.card}>
                  <div className={styles.row}>
                    <h2>匿名访客 {visitor.slice(0, 8)} · 30 天旅程</h2>
                    <button onClick={() => setVisitor("")}>关闭</button>
                  </div>
                  {journey ? (
                    <>
                      <p className={styles.muted}>
                        {journey.truncated
                          ? "仅显示 30 天内最早 500 条事件。"
                          : "仅包含已采集的浏览和自定义事件。"}
                      </p>
                      <ol className={styles.journey}>
                        {journey.events.map((e) => (
                          <li key={e.event_id}>
                            <time>
                              {new Date(e.occurred_at).toLocaleString()}
                            </time>{" "}
                            · {e.name || e.type}
                            <code>
                              {e.pathname} · 会话 {e.session_id.slice(0, 8)}
                            </code>
                            {Object.keys(e.properties).length > 0 && (
                              <code>{JSON.stringify(e.properties)}</code>
                            )}
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <p role="status">正在加载旅程…</p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
