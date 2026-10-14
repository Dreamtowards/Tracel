import { test } from "node:test";
import assert from "node:assert/strict";
import { MockVisitorStream } from "../src/radar/simulation/simulation";

test("seeded visitors have coherent journeys and plausible clients", () => {
  const stream = new MockVisitorStream(1700000000000);
  const snapshot = stream.snapshot();
  assert.equal(Object.keys(snapshot.visitors).length, 12);
  for (const visitor of Object.values(snapshot.visitors)) {
    assert.equal(visitor.journey[0].type, "session_start");
    assert.equal(visitor.journey[1].type, "page_view");
    assert.equal(
      visitor.currentPage.pathname,
      visitor.journey.at(-1)?.pathname,
    );
    assert.equal(visitor.sessionStartedAt, visitor.journey[0].timestamp);
    assert.ok(visitor.firstSeen <= visitor.sessionStartedAt);
    assert.ok((visitor.visitCount ?? 1) >= 1);
    if ((visitor.visitCount ?? 1) > 1) {
      assert.ok(visitor.firstSeen < visitor.sessionStartedAt);
      assert.ok((visitor.previousSessionDurationMs ?? 0) > 0);
    }
    for (let i = 1; i < visitor.journey.length; i++)
      assert.ok(
        visitor.journey[i].timestamp >= visitor.journey[i - 1].timestamp,
      );
    assert.ok(visitor.lastSeen <= snapshot.now);
    if (visitor.client.os === "iOS")
      assert.equal(visitor.client.device, "Mobile");
  }
  assert.deepEqual(snapshot, new MockVisitorStream(1700000000000).snapshot());
});

test("all lifecycle transitions occur, navigation remains consistent, and subscription cleans up", () => {
  const stream = new MockVisitorStream(1700000000000);
  const types = new Set<string>();
  let notifications = 0;
  const unsubscribe = stream.subscribe((event) => {
    types.add(event.type);
    notifications++;
    assert.equal(
      event.visitor.currentPage.pathname,
      event.journeyEvent.pathname,
    );
    assert.equal(event.visitor.journey.at(-1)?.id, event.journeyEvent.id);
    if (event.type === "navigation")
      assert.notEqual(
        event.journeyEvent.pathname,
        event.journeyEvent.previousPathname,
      );
  });
  for (let i = 0; i < 600; i++) stream.advance(1000);
  for (const type of [
    "visitor_joined",
    "page_view",
    "navigation",
    "visitor_idle",
    "visitor_reactivated",
    "visitor_left",
  ])
    assert.ok(types.has(type), type);
  unsubscribe();
  const before = notifications;
  stream.advance(10000);
  assert.equal(notifications, before);
});

test("long running simulation retains bounded events, visitors and timelines", () => {
  const stream = new MockVisitorStream(1700000000000);
  for (let i = 0; i < 7200; i++) stream.advance(1000);
  const snapshot = stream.snapshot();
  assert.ok(snapshot.events.length <= 80);
  assert.ok(
    snapshot.recentEventTimes.every(
      (at) => at > snapshot.now - 60000 && at <= snapshot.now,
    ),
  );
  assert.ok(Object.keys(snapshot.visitors).length < 70);
  for (const visitor of Object.values(snapshot.visitors)) {
    assert.ok(visitor.journey.length <= 64);
    if (visitor.status === "offline")
      assert.ok(snapshot.now - visitor.lastSeen <= 45000);
  }
});

test("event rate keeps the full minute independently of feed retention", () => {
  const stream = new MockVisitorStream(1700000000000, 42, 120);
  for (let i = 0; i < 30; i++) stream.advance(1000);
  const snapshot = stream.snapshot();
  assert.equal(snapshot.events.length, 80);
  assert.ok(snapshot.recentEventTimes.length > 80);
});

test("accelerated time matches the same elapsed normal simulation", () => {
  const normal = new MockVisitorStream(1700000000000);
  const fast = new MockVisitorStream(1700000000000);
  for (let i = 0; i < 200; i++) normal.advance(250);
  for (let i = 0; i < 10; i++) fast.advance(5000);
  assert.deepEqual(fast.snapshot(), normal.snapshot());
});
