import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const a = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
import { database } from "./database-fixture";
test("migration, tenant isolation, atomic ingest, dedup, expiry and retention", async () => {
  const db = await database();
  const role = async (user: string) => {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`,
    );
  };
  await role(a);
  const s1 = (
    await db.query<{ s: { id: string } }>(
      "select radar_create_site('A',array['a.test']) s",
    )
  ).rows[0].s;
  await role(b);
  const s2 = (
    await db.query<{ s: { id: string } }>(
      "select radar_create_site('B',array['b.test']) s",
    )
  ).rows[0].s;
  assert.equal((await db.query("select * from radar_sites")).rows.length, 1);
  await assert.rejects(
    db.query("select radar_snapshot($1)", [s1.id]),
    /forbidden/,
  );
  await assert.rejects(
    db.query("select radar_ingest($1,'{}','{}')", [s2.id]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("insert into radar_site_members values($1,$2)", [s1.id, b]),
    /permission denied/,
  );
  assert.equal(
    (
      await db.query(
        "update radar_sites set public_enabled=true where id=$1 returning id",
        [s1.id],
      )
    ).rows.length,
    0,
  );
  await db.exec("reset role;set role service_role;");
  const now = Date.now();
  const e = {
    eventId: "event_1234",
    visitorId: "visitor_1234",
    sessionId: "session_1234",
    occurredAt: now,
    type: "page_view",
    pathname: "/",
  };
  const ingest = async (event: unknown) =>
    db.query<{ ok: boolean }>("select radar_ingest($1,$2::jsonb,'{}') ok", [
      s1.id,
      JSON.stringify(event),
    ]);
  assert.equal((await ingest(e)).rows[0].ok, true);
  assert.equal((await ingest(e)).rows[0].ok, false);
  await assert.rejects(
    ingest({ ...e, eventId: "conflict_1234", visitorId: "other_visitor" }),
    /session_identity_conflict/,
  );
  assert.equal(
    (await db.query<{ n: number }>("select count(*)::int n from radar_events"))
      .rows[0].n,
    1,
  );
  await ingest({
    ...e,
    eventId: "older_1234",
    occurredAt: now - 10000,
    pathname: "/old",
  });
  assert.equal(
    (
      await db.query<{ pathname: string }>(
        "select pathname from radar_sessions",
      )
    ).rows[0].pathname,
    "/",
  );
  let summary = (
    await db.query<{
      s: { online: number; pageViews: number; visitors: number };
    }>("select radar_summary($1) s", [s1.id])
  ).rows[0].s;
  assert.deepEqual(
    [summary.online, summary.pageViews, summary.visitors],
    [1, 2, 1],
  );
  await db.query(
    "update radar_sessions set last_seen=now()-interval '61 seconds'",
  );
  assert.equal(
    (
      await db.query<{ s: { online: number } }>("select radar_summary($1) s", [
        s1.id,
      ])
    ).rows[0].s.online,
    0,
  );
  await role(a);
  assert.equal(
    (
      await db.query<{ s: { events: unknown[] } }>(
        "select radar_snapshot($1) s",
        [s1.id],
      )
    ).rows[0].s.events.length,
    2,
  );
  assert.equal(
    (
      await db.query<{ s: { events: unknown[] } }>(
        "select radar_journey($1,$2) s",
        [s1.id, "visitor_1234"],
      )
    ).rows[0].s.events.length,
    2,
  );
  await db.exec("reset role;set role anon;");
  await assert.rejects(
    db.query("select radar_summary($1)", [s1.id]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select * from radar_events"),
    /permission denied/,
  );
  await db.exec(
    "reset role;set role service_role;update radar_events set received_at=now()-interval '31 days';update radar_sessions set last_seen=now()-interval '31 days';select radar_cleanup();",
  );
  assert.equal((await db.query("select * from radar_events")).rows.length, 0);
  assert.equal((await db.query("select * from radar_sessions")).rows.length, 0);
  await db.close();
});
