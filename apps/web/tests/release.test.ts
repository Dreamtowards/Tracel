import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

test("advertised download is a complete Windows EXE with a matching checksum", () => {
  const release = JSON.parse(readFileSync(new URL("../src/release.json", import.meta.url), "utf8"));
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
  assert.equal(release.url, `/downloads/Tracel-${release.version}-windows-x64.exe`);
  const file = new URL(`../public${release.url}`, import.meta.url);
  const exe = readFileSync(file);
  assert.equal(exe.length, release.bytes);
  assert.equal(exe.toString("ascii", 0, 2), "MZ");
  const peOffset = exe.readUInt32LE(0x3c);
  assert.equal(exe.readUInt32LE(peOffset), 0x4550);
  assert.equal(exe.readUInt16LE(peOffset + 4), 0x8664);
  const hash = createHash("sha256").update(exe).digest("hex");
  assert.equal(hash, release.sha256);
  const checksum = readFileSync(new URL(file.href.replace(/\.exe$/, ".sha256")), "utf8");
  assert.equal(checksum.trim(), `${hash}  Tracel-${release.version}-windows-x64.exe`);
});
