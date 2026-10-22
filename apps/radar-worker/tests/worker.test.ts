import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, type Env } from "../src/index";
import { database } from "./database-fixture";
import type { Site } from "@tracel/radar-contracts";
const users: Record<string, string> = {
  a: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  b: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
};
test("Worker → real PostgreSQL: two sites, collection, auth, public projection and revocation", async () => {
  const db = await database();
  const upstream: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const token = headers.get("Authorization")?.replace("Bearer ", "") || "";
    if (url.pathname === "/auth/v1/user")
      return new Response(JSON.stringify({ id: users[token] }), {
        status: users[token] ? 200 : 401,
      });
    await db.exec("reset role");
    if (token === "service") await db.exec("set role service_role");
    else {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        users[token] || "",
      ]);
    }
    try {
      const args = init?.body ? JSON.parse(init.body as string) : {};
      let result: unknown;
      if (url.pathname.includes("/rpc/")) {
        const fn = url.pathname.split("/").pop()!;
        const keys: Record<string, string[]> = {
          radar_create_site: ["p_name", "p_domains"],
          radar_ingest: ["p_site", "p_event", "p_geo"],
          radar_summary: ["p_site"],
          radar_snapshot: ["p_site"],
          radar_journey: ["p_site", "p_visitor"],
          radar_cleanup: [],
        };
        const order = keys[fn];
        if (!order) throw Error();
        const values = order.map((key) =>
          key === "p_event" || key === "p_geo"
            ? JSON.stringify(args[key])
            : args[key],
        );
        result = (
          await db.query<{ value: unknown }>(
            `select public.${fn}(${order.map((_, i) => `$${i + 1}`).join(",")}) value`,
            values,
          )
        ).rows[0].value;
      } else if (url.pathname === "/rest/v1/radar_sites") {
        const clauses: string[] = [];
        const values: unknown[] = [];
        for (const key of ["id", "site_key", "public_enabled"]) {
          const v = url.searchParams.get(key);
          if (v) {
            values.push(v.slice(3));
            clauses.push(`${key}=$${values.length}`);
          }
        }
        const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
        if (init?.method === "PATCH") {
          const fields = Object.keys(args);
          const start = values.length;
          values.push(...Object.values(args));
          result = (
            await db.query(
              `update radar_sites set ${fields.map((k, i) => `${k}=$${start + i + 1}`).join(",")} ${where} returning *`,
              values,
            )
          ).rows;
        } else
          result = (
            await db.query(`select * from radar_sites ${where}`, values)
          ).rows;
      } else throw Error();
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response("{}", { status: 403 });
    }
  };
  const limiter = { limit: async () => ({ success: true }) };
  const env: Env = {
    SUPABASE_URL: "https://db.test",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    APP_ORIGINS: "https://radar.test",
    REQUEST_LIMITER: limiter,
    SITE_LIMITER: limiter,
  };
  const handler = createHandler(upstream);
  const req = (
    path: string,
    method = "GET",
    body?: unknown,
    token = "a",
    origin = "https://radar.test",
  ) =>
    handler.fetch(
      new Request(`https://api.test/v1${path}`, {
        method,
        headers: {
          Origin: origin,
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
          "User-Agent": "Browser",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  const siteA: Site = await (
    await req("/sites", "POST", { name: "A", domains: ["a.test"] })
  ).json();
  const siteB: Site = await (
    await req("/sites", "POST", { name: "B", domains: ["b.test"] }, "b")
  ).json();
  assert.ok(siteA.id);
  assert.ok(siteB.id);
  assert.equal((await (await req("/sites")).json()).length, 1);
  assert.equal(
    (await req(`/sites/${siteA.id}/snapshot`, "GET", undefined, "b")).status,
    404,
  );
  const event = {
    schemaVersion: 1,
    eventId: "event_1234",
    siteKey: siteA.site_key,
    visitorId: "visitor_1234",
    sessionId: "session_1234",
    occurredAt: Date.now(),
    type: "page_view",
    pathname: "/docs?secret=1",
  };
  assert.equal(
    (await req("/collect", "POST", event, "", "https://b.test")).status,
    403,
  );
  assert.equal(
    (await req("/collect", "POST", event, "", "https://a.test")).status,
    202,
  );
  assert.equal(
    (await (await req("/collect", "POST", event, "", "https://a.test")).json())
      .duplicate,
    true,
  );
  assert.equal(
    (
      await req(
        "/collect",
        "POST",
        { ...event, schemaVersion: 2 },
        "",
        "https://a.test",
      )
    ).status,
    400,
  );
  const snapshot = await (await req(`/sites/${siteA.id}/snapshot`)).json();
  assert.equal(snapshot.summary.pageViews, 1);
  assert.equal(snapshot.events[0].pathname, "/docs");
  assert.equal(
    (
      await req(
        `/public/sites/${siteA.site_key}/summary`,
        "GET",
        undefined,
        "",
        "https://a.test",
      )
    ).status,
    404,
  );
  assert.equal(
    (await req(`/sites/${siteA.id}`, "PATCH", { public_enabled: true })).status,
    200,
  );
  const pub = await (
    await req(
      `/public/sites/${siteA.site_key}/summary`,
      "GET",
      undefined,
      "",
      "https://a.test",
    )
  ).json();
  assert.deepEqual(Object.keys(pub).sort(), ["now", "online", "pageViews"]);
  await req(`/sites/${siteA.id}`, "PATCH", { public_enabled: false });
  assert.equal(
    (await req(`/public/sites/${siteA.site_key}/summary`)).status,
    404,
  );
  assert.equal((await req("/sites", "GET", undefined, "invalid")).status, 401);
  assert.equal(
    (
      await req(
        "/collect",
        "POST",
        { ...event, properties: { x: "x".repeat(20000) } },
        "",
        "https://a.test",
      )
    ).status,
    413,
  );
  const blocked = {
    ...env,
    REQUEST_LIMITER: { limit: async () => ({ success: false }) },
  };
  assert.equal(
    (
      await handler.fetch(
        new Request("https://api.test/v1/sites", {
          headers: { Origin: "https://radar.test" },
        }),
        blocked,
      )
    ).status,
    429,
  );
  await db.close();
});
