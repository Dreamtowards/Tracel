import test from "node:test";
import assert from "node:assert/strict";
import { toStream } from "../src/radar/data-source/snapshot";
import type { Snapshot } from "@tracel/radar-contracts";
test("real source keeps custom events, missing geo and online expiry separate from demo", () => {
  const now = Date.now();
  const time = new Date(now).toISOString();
  const data: Snapshot = {
    summary: { online: 1, pageViews: 1, visitors: 1, now },
    sessions: [
      {
        session_id: "session_1234",
        visitor_id: "visitor_1234",
        started_at: time,
        last_seen: time,
        pathname: "/docs",
        country: null,
        city: null,
      },
    ],
    events: [
      {
        event_id: "event_1234",
        visitor_id: "visitor_1234",
        session_id: "session_1234",
        occurred_at: time,
        received_at: time,
        type: "custom",
        pathname: "/docs",
        name: "signup_clicked",
        properties: { count: 0 },
        referrer: null,
        country: null,
        city: null,
      },
    ],
    pages: [],
    sources: [],
    countries: [],
    cities: [],
    truncated: false,
  };
  const stream = toStream(data);
  assert.equal(stream.events[0].type, "custom");
  assert.equal(stream.visitors.session_1234.location.available, false);
  assert.equal(stream.visitors.session_1234.anonymousId, "visitor_1234");
  assert.equal(stream.visitors.session_1234.journey[0].properties?.count, 0);
  assert.equal(stream.trafficRecords.length, 0);
  data.summary.now = now + 61_000;
  assert.equal(toStream(data).visitors.session_1234.status, "offline");
});
