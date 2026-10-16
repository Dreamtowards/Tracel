import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { browserPlatform } from "../src/desktop/platform";

test("browser platform fails closed for every native operation", async () => {
  assert.equal(browserPlatform.nativeClient, false);
  for (const operation of Object.values(browserPlatform)) {
    if (typeof operation === "function") await assert.rejects(() => (operation as () => Promise<unknown>)(), /requires the Windows client/);
  }
});

test("shared Desktop presentation contains no native or host-app imports", () => {
  const root = new URL("../src/desktop/", import.meta.url);
  for (const entry of readdirSync(root, { recursive: true, encoding: "utf8" }).filter(name => /\.(ts|tsx)$/.test(name))) {
    const source = readFileSync(new URL(entry.replaceAll("\\", "/"), root), "utf8");
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*["'][^"']*(?:@tauri-apps|apps\/desktop|apps\/web|\.\/native)[^"']*["']/, entry);
  }
});
