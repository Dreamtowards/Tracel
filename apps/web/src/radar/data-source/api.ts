import type { Site, Snapshot, StoredEvent } from "@tracel/radar-contracts";
export const apiBase = (process.env.NEXT_PUBLIC_RADAR_API_URL || "").replace(
  /\/$/,
  "",
);
export async function radarApi<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!apiBase) throw new Error("请配置 NEXT_PUBLIC_RADAR_API_URL");
  const response = await fetch(`${apiBase}/v1${path}`, {
    ...init,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(12_000)])
      : AbortSignal.timeout(12_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) {
    const messages: Record<string, string> = {
      unauthorized: "登录已过期，请重新登录。",
      site_unavailable: "网站不存在或当前账号没有访问权限。",
      invalid_domains: "请填写完整域名，不含协议、端口、路径或通配符。",
      invalid_name: "网站名称需要为 1–80 个字符。",
      rate_limited: "请求过于频繁，请稍后重试。",
      not_configured: "Radar 服务尚未完成配置。",
      database_unavailable: "数据服务暂时不可用，请稍后重试。",
      app_origin_rejected: "当前后台地址尚未获得 API 访问授权。",
    };
    throw new Error(messages[result.error] || "Radar 请求失败，请稍后重试。");
  }
  return result;
}
export const getSnapshot = (site: Site, token: string, signal?: AbortSignal) =>
  radarApi<Snapshot>(`/sites/${site.id}/snapshot`, token, {}, signal);
export const getJourney = (
  site: Site,
  token: string,
  visitorId: string,
  signal?: AbortSignal,
) =>
  radarApi<{ events: StoredEvent[]; truncated: boolean }>(
    `/sites/${site.id}/journey?visitorId=${encodeURIComponent(visitorId)}`,
    token,
    {},
    signal,
  );
