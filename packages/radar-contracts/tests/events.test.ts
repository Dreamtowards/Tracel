import test from "node:test";
import assert from "node:assert/strict";
import { parseEvent, parseDomains, normalizePath } from "../src/index";
const now = Date.now();
const event = {
  schemaVersion: 1,
  eventId: "event_1234",
  siteKey: "site_1234",
  visitorId: "visitor_1234",
  sessionId: "session_1234",
  occurredAt: now,
  type: "page_view",
  pathname: "/docs?token=secret#section",
};
test("normalizes URLs, strips unknown fields and referrer paths", () => {
  const e = parseEvent(
    {
      ...event,
      email: "private",
      referrer: "https://source.test/private?token=1",
    },
    now,
  );
  assert.equal(e.pathname, "/docs");
  assert.equal(e.referrer, "https://source.test");
  assert.ok(!("email" in e));
});
test("rejects future, obsolete, malformed and sensitive payloads", () => {
  for (const change of [
    { schemaVersion: 2 },
    { occurredAt: now + 1e6 },
    { occurredAt: now - 2 * 864e5 },
    { pathname: "//evil.test" },
    { type: "custom", name: "click", properties: { email: "private" } },
    { type: "custom", name: "click", properties: { nested: { x: 1 } } },
  ])
    assert.throws(() => parseEvent({ ...event, ...change }, now));
});
test("custom events preserve finite zero and boolean values", () =>
  assert.deepEqual(
    {
      ...parseEvent(
        {
          ...event,
          type: "custom",
          name: "signup.clicked",
          properties: { count: 0, success: false },
        },
        now,
      ).properties,
    },
    { count: 0, success: false },
  ));
test("domains are exact normalized hosts, paths cannot be absolute URLs", () => {
  assert.deepEqual(parseDomains(["example.com", "localhost", "example.com"]), [
    "example.com",
    "localhost",
  ]);
  for (const domain of [
    "*.example.com",
    "https://example.com",
    "example.com/path",
    "example.com:1234",
  ])
    assert.throws(() => parseDomains([domain]));
  assert.throws(() => normalizePath("https://example.com"));
});
