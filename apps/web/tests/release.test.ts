import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

test("website downloads reference a versioned GitHub Release asset", () => {
  const release = JSON.parse(readFileSync(new URL("../src/release.json", import.meta.url), "utf8"));
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
  assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(release.platform, "Windows x64");
  assert.ok(Number.isSafeInteger(release.bytes) && release.bytes > 1_000_000);
  assert.match(release.sha256, /^[a-f0-9]{64}$/);
  const url = new URL(release.url);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  const parts = url.pathname.split("/");
  assert.equal(parts.length, 7);
  assert.ok(parts[1] && parts[2]);
  assert.deepEqual(parts.slice(3), ["releases", "download", `v${release.version}`, `Tracel-${release.version}-windows-x64.exe`]);
});

test("public website assets do not bundle release binaries", () => {
  const files = readdirSync(new URL("../public/", import.meta.url), { recursive: true });
  assert.deepEqual(files.filter((file) => /\.(exe|msi|zip)$/i.test(String(file))), []);
});
