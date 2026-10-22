import { parseEvent } from "@tracel/radar-contracts";
import type { CollectEvent, Properties } from "@tracel/radar-contracts";
export interface Tracker {
  track(name: string, properties?: Properties): void;
  stop(): void;
  start(): void;
  destroy(): void;
}
declare global {
  interface Window {
    radar?: Tracker;
  }
}
export function installTracker(
  win: Window,
  script: HTMLScriptElement,
): Tracker | undefined {
  const siteKey = script.dataset.site;
  const endpoint = script.dataset.endpoint;
  if (!siteKey || !endpoint) return;
  let api: URL;
  try {
    api = new URL(endpoint);
    if (!["https:", "http:"].includes(api.protocol)) return;
  } catch {
    return;
  }
  const doc = win.document;
  let enabled = script.dataset.consent !== "denied";
  let destroyed = false;
  const random = () => win.crypto.randomUUID();
  const stored = (storage: Storage, key: string) => {
    try {
      let v = storage.getItem(key);
      if (!v) {
        v = random();
        storage.setItem(key, v);
      }
      return v;
    } catch {
      return random();
    }
  };
  // Storage is only touched after collection is enabled. IDs are scoped to this site.
  let visitorId = "",
    sessionId = "",
    lastPath = "",
    lastActivity = 0;
  function identity() {
    if (visitorId) return;
    try {
      visitorId = stored(win.localStorage, `radar:${siteKey}:visitor`);
    } catch {
      visitorId = random();
    }
    try {
      sessionId = stored(win.sessionStorage, `radar:${siteKey}:session`);
    } catch {
      sessionId = random();
    }
    try {
      lastActivity =
        Number(win.sessionStorage.getItem(`radar:${siteKey}:last`)) || 0;
    } catch {}
  }
  function send(
    type: CollectEvent["type"],
    name?: string,
    properties?: Properties,
    leaving = false,
  ) {
    if (
      !enabled ||
      destroyed ||
      (type === "heartbeat" && doc.visibilityState === "hidden" && !leaving)
    )
      return;
    identity();
    const now = Date.now();
    if (lastActivity && now - lastActivity > 30 * 60_000) {
      sessionId = random();
      try {
        win.sessionStorage.setItem(`radar:${siteKey}:session`, sessionId);
      } catch {}
    }
    const pathname = win.location.pathname;
    const event = {
      schemaVersion: 1,
      eventId: random(),
      siteKey,
      visitorId,
      sessionId,
      occurredAt: now,
      type,
      pathname,
      name,
      properties,
      referrer: doc.referrer || undefined,
    };
    let body: string;
    try {
      body = JSON.stringify(parseEvent(event, now));
    } catch {
      return;
    }
    lastActivity = now;
    try {
      win.sessionStorage.setItem(`radar:${siteKey}:last`, String(now));
    } catch {}
    try {
      if (
        leaving &&
        win.navigator.sendBeacon?.(
          api.href,
          new Blob([body], { type: "text/plain" }),
        )
      )
        return;
    } catch {}
    // One bounded retry reuses eventId. The database transaction deduplicates it.
    const attempt = () =>
      win.fetch(api.href, {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain" },
        keepalive: true,
        credentials: "omit",
        signal: AbortSignal.timeout(8000),
      });
    void attempt()
      .then((r) => {
        if (r.status >= 500 && enabled && !destroyed) return attempt();
      })
      .catch(() => {
        /* collection never breaks the host page */
      });
  }
  const page = () => {
    if (
      enabled &&
      doc.visibilityState !== "hidden" &&
      win.location.pathname !== lastPath
    ) {
      lastPath = win.location.pathname;
      send("page_view");
    }
  };
  const visible = () => {
    if (doc.visibilityState === "visible") {
      page();
      send("heartbeat");
    } else send("heartbeat", undefined, undefined, true);
  };
  const push = win.history.pushState;
  const replace = win.history.replaceState;
  const wrappedPush: History["pushState"] = function (...args) {
    push.apply(win.history, args);
    page();
  };
  const wrappedReplace: History["replaceState"] = function (...args) {
    replace.apply(win.history, args);
    page();
  };
  win.history.pushState = wrappedPush;
  win.history.replaceState = wrappedReplace;
  win.addEventListener("popstate", page);
  doc.addEventListener("visibilitychange", visible);
  const timer = win.setInterval(() => send("heartbeat"), 20_000);
  const tracker: Tracker = {
    track: (name, props) => send("custom", name, props),
    stop() {
      enabled = false;
    },
    start() {
      if (!destroyed && !enabled) {
        enabled = true;
        lastPath = "";
        page();
      }
    },
    destroy() {
      destroyed = true;
      enabled = false;
      win.clearInterval(timer);
      win.removeEventListener("popstate", page);
      doc.removeEventListener("visibilitychange", visible);
      if (win.history.pushState === wrappedPush) win.history.pushState = push;
      if (win.history.replaceState === wrappedReplace)
        win.history.replaceState = replace;
    },
  };
  page();
  return tracker;
}
if (typeof window !== "undefined" && !window.radar) {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script) window.radar = installTracker(window, script);
}
