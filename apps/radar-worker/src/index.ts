import { MAX_BODY, parseDomains, parseEvent } from "@tracel/radar-contracts";
import type { Site, Summary } from "@tracel/radar-contracts";
interface Limiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  APP_ORIGINS: string;
  REQUEST_LIMITER: Limiter;
  SITE_LIMITER: Limiter;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
type Fetcher = typeof fetch;
export function createHandler(fetcher: Fetcher = fetch) {
  const summaryCache = new Map<string, { summary: Summary; at: number }>();
  async function db(
    env: Env,
    path: string,
    options: RequestInit = {},
    token?: string,
  ) {
    const response = await fetcher(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      signal: AbortSignal.timeout(10_000),
      headers: {
        apikey: token ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token || env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    if (!response.ok)
      throw new HttpError(
        response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
        "database_unavailable",
      );
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }
  async function rpc(env: Env, name: string, args: unknown, token?: string) {
    return db(
      env,
      `rpc/${name}`,
      { method: "POST", body: JSON.stringify(args) },
      token,
    );
  }
  async function read(request: Request) {
    if (Number(request.headers.get("Content-Length")) > MAX_BODY)
      throw new HttpError(413, "payload_too_large");
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "invalid_json");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new HttpError(413, "payload_too_large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      const value = JSON.parse(new TextDecoder().decode(bytes));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
      return value;
    } catch {
      throw new HttpError(400, "invalid_json");
    }
  }
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const origin = request.headers.get("Origin") || "";
      const appOrigin = env.APP_ORIGINS?.split(",")
        .map((x) => x.trim())
        .includes(origin);
      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Origin",
      });
      if (origin && origin !== "null")
        headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status, headers });
      try {
        if (request.method === "OPTIONS")
          return new Response(null, { status: 204, headers });
        if (
          !env.SUPABASE_URL ||
          !env.SUPABASE_SERVICE_ROLE_KEY ||
          !env.SUPABASE_ANON_KEY ||
          !env.REQUEST_LIMITER ||
          !env.SITE_LIMITER
        )
          throw new HttpError(503, "not_configured");
        const url = new URL(request.url);
        const path = url.pathname;
        // IP is used transiently for abuse protection, never stored in Postgres or logs.
        const peer = request.headers.get("CF-Connecting-IP") || "local";
        if (
          !(
            await env.REQUEST_LIMITER.limit({
              key: `${path.startsWith("/v1/collect") ? "collect" : "query"}:${peer}`,
            })
          ).success
        )
          throw new HttpError(429, "rate_limited");
        if (path === "/v1/collect" && request.method === "POST") {
          let event;
          try {
            event = parseEvent(await read(request));
          } catch (error) {
            if (error instanceof HttpError) throw error;
            throw new HttpError(
              400,
              error instanceof Error ? error.message : "invalid_event",
            );
          }
          if (!(await env.SITE_LIMITER.limit({ key: event.siteKey })).success)
            throw new HttpError(429, "site_rate_limited");
          const sites: Site[] = await db(
            env,
            `radar_sites?site_key=eq.${encodeURIComponent(event.siteKey)}&select=id,domains`,
          );
          const site = sites[0];
          let host = "";
          try {
            host = new URL(origin).hostname;
          } catch {
            /* missing/non-browser origin rejected */
          }
          if (!site || !host || !site.domains.includes(host))
            throw new HttpError(403, "site_origin_rejected");
          if (
            /bot|crawler|spider|headless/i.test(
              request.headers.get("User-Agent") || "",
            )
          )
            return json({ accepted: false, reason: "bot" }, 202);
          const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
          const text = (v: unknown, n: number) =>
            typeof v === "string" ? v.slice(0, n) : null;
          const coarse = (v: unknown, max: number) => {
            const n = Number(v);
            return v != null && Number.isFinite(n) && Math.abs(n) <= max
              ? Math.round(n)
              : null;
          };
          const geo = {
            country: text(cf?.country, 2),
            city: text(cf?.city, 80),
            latitude: coarse(cf?.latitude, 90),
            longitude: coarse(cf?.longitude, 180),
          };
          const inserted = await rpc(env, "radar_ingest", {
            p_site: site.id,
            p_event: event,
            p_geo: geo,
          });
          return json({ accepted: true, duplicate: !inserted }, 202);
        }
        const pub =
          /^\/v1\/public\/sites\/([a-zA-Z0-9_-]{8,80})\/summary$/.exec(path);
        if (pub && request.method === "GET") {
          const sites: Site[] = await db(
            env,
            `radar_sites?site_key=eq.${pub[1]}&public_enabled=eq.true&select=id`,
          );
          if (!sites[0]) throw new HttpError(404, "public_site_unavailable");
          // Check publication on every request; no stale cache survives revocation.
          const id = sites[0].id;
          const cached = summaryCache.get(id);
          const s: Summary =
            cached && Date.now() - cached.at < 10_000
              ? cached.summary
              : await rpc(env, "radar_summary", { p_site: id });
          if (summaryCache.size > 1000) summaryCache.clear();
          summaryCache.set(id, {
            summary: s,
            at: cached && cached.summary === s ? cached.at : Date.now(),
          });
          return json({ online: s.online, pageViews: s.pageViews, now: s.now });
        }
        if (!appOrigin) throw new HttpError(403, "app_origin_rejected");
        const token = /^Bearer (.+)$/.exec(
          request.headers.get("Authorization") || "",
        )?.[1];
        if (!token) throw new HttpError(401, "unauthorized");
        const auth = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!auth.ok) throw new HttpError(401, "unauthorized");
        if (path === "/v1/sites" && request.method === "GET")
          return json(
            await db(env, "radar_sites?select=*&order=created_at", {}, token),
          );
        if (path === "/v1/sites" && request.method === "POST") {
          const input = await read(request);
          let domains;
          try {
            domains = parseDomains(input.domains);
          } catch {
            throw new HttpError(400, "invalid_domains");
          }
          if (
            typeof input.name !== "string" ||
            !input.name.trim() ||
            input.name.length > 80
          )
            throw new HttpError(400, "invalid_name");
          return json(
            await rpc(
              env,
              "radar_create_site",
              { p_name: input.name.trim(), p_domains: domains },
              token,
            ),
            201,
          );
        }
        const route =
          /^\/v1\/sites\/([0-9a-f-]{36})(?:\/(snapshot|journey))?$/.exec(path);
        if (route) {
          const sites = await db(
            env,
            `radar_sites?id=eq.${route[1]}&select=id`,
            {},
            token,
          );
          if (!sites.length) throw new HttpError(404, "site_unavailable");
          if (route[2] === "snapshot" && request.method === "GET")
            return json(
              await rpc(env, "radar_snapshot", { p_site: route[1] }, token),
            );
          if (route[2] === "journey" && request.method === "GET") {
            const visitor = url.searchParams.get("visitorId") || "";
            if (!/^[a-zA-Z0-9_-]{8,80}$/.test(visitor))
              throw new HttpError(400, "invalid_identifier");
            return json(
              await rpc(
                env,
                "radar_journey",
                { p_site: route[1], p_visitor: visitor },
                token,
              ),
            );
          }
          if (!route[2] && request.method === "PATCH") {
            const input = await read(request);
            const update: Record<string, unknown> = {};
            if (input.domains !== undefined) {
              try {
                update.domains = parseDomains(input.domains);
              } catch {
                throw new HttpError(400, "invalid_domains");
              }
            }
            if (typeof input.public_enabled === "boolean")
              update.public_enabled = input.public_enabled;
            if (input.theme === "light" || input.theme === "dark")
              update.theme = input.theme;
            if (!Object.keys(update).length)
              throw new HttpError(400, "empty_update");
            const updated = await db(
              env,
              `radar_sites?id=eq.${route[1]}`,
              {
                method: "PATCH",
                headers: { Prefer: "return=representation" },
                body: JSON.stringify(update),
              },
              token,
            );
            if (updated.length !== 1)
              throw new HttpError(404, "site_unavailable");
            return json(updated);
          }
        }
        throw new HttpError(404, "not_found");
      } catch (error) {
        if (error instanceof HttpError)
          return json({ error: error.code }, error.status);
        // Never log request bodies, IPs, auth tokens, or upstream responses.
        return json({ error: "service_unavailable" }, 503);
      }
    },
    async scheduled(_event: unknown, env: Env) {
      try {
        await rpc(env, "radar_cleanup", {});
        console.log("radar_cleanup_success");
      } catch {
        console.error("radar_cleanup_failed");
        throw new Error("radar_cleanup_failed");
      }
    },
  };
}
export default createHandler();
