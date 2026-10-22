import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { installTracker } from "../src/index";
function browser(consent = "granted", storageFails = false) {
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    referrer: "https://search.test/private?q=secret",
  });
  const location = { pathname: "/" };
  const sent: Record<string, unknown>[] = [];
  const storage = {
    getItem: () => {
      if (storageFails) throw Error();
      return null;
    },
    setItem: () => {
      if (storageFails) throw Error();
    },
  };
  let tick: () => void = () => {};
  let clears = 0;
  const win = {
    document: doc,
    location,
    localStorage: storage,
    sessionStorage: storage,
    crypto: { randomUUID },
    navigator: { sendBeacon: () => false },
    fetch: async (_url: unknown, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response("{}", { status: 202 });
    },
    setInterval: (fn: () => void) => {
      tick = fn;
      return 1;
    },
    clearInterval: () => {
      clears++;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    history: {
      pushState: (_s: unknown, _u: unknown, url: string) => {
        location.pathname = url.split("?")[0];
      },
      replaceState: (_s: unknown, _u: unknown, url: string) => {
        location.pathname = url.split("?")[0];
      },
    },
  };
  const tracker = installTracker(
    win as unknown as Window,
    {
      dataset: {
        site: "site_1234",
        endpoint: "https://api.test/v1/collect",
        consent,
      },
    } as unknown as HTMLScriptElement,
  )!;
  return { win, doc, sent, tracker, tick: () => tick(), clears: () => clears };
}
test("tracks load, SPA navigation and custom events without query strings", () => {
  const b = browser();
  b.win.history.pushState({}, "", "/docs?secret=1");
  b.win.history.replaceState({}, "", "/docs?secret=2");
  b.tracker.track("purchase_clicked", { amount: 0 });
  assert.equal(b.sent.length, 3);
  assert.equal(b.sent[1].pathname, "/docs");
  assert.equal(b.sent[2].type, "custom");
  assert.equal(b.sent[0].referrer, "https://search.test");
  assert.equal(b.sent[0].visitorId, b.sent[2].visitorId);
  b.tracker.destroy();
  assert.equal(b.clears(), 1);
});
test("consent denied, hidden page and stop send no heartbeats", () => {
  const b = browser("denied");
  assert.equal(b.sent.length, 0);
  b.tick();
  assert.equal(b.sent.length, 0);
  b.tracker.start();
  assert.equal(b.sent.length, 1);
  b.doc.visibilityState = "hidden";
  b.tick();
  assert.equal(b.sent.length, 1);
  b.doc.visibilityState = "visible";
  b.tick();
  assert.equal(b.sent.length, 2);
  b.tracker.stop();
  b.tracker.track("click");
  b.tick();
  assert.equal(b.sent.length, 2);
  b.tracker.destroy();
  b.tracker.start();
  assert.equal(b.sent.length, 2);
});
test("storage denial does not break collection or identity within page", () => {
  const b = browser("granted", true);
  b.tick();
  assert.equal(b.sent.length, 2);
  assert.equal(b.sent[0].visitorId, b.sent[1].visitorId);
  b.tracker.destroy();
});
