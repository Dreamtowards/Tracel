import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrackHidden, normalizeHiddenSources, trackSources } from "../src/trackVisibility";

test("persisted visibility accepts known unique sources and defaults old/invalid settings to visible", () => {
  assert.deepEqual(normalizeHiddenSources(undefined), []);
  assert.deepEqual(normalizeHiddenSources("cpu"), []);
  assert.deepEqual(normalizeHiddenSources(["gpu", "unknown", "cpu", "gpu", null]), ["cpu", "gpu"]);
  assert.equal(isTrackHidden("cpu", []), false);
});

test("collector visibility covers dependent tracks while leaving unrelated rows and partially visible groups intact", () => {
  for (const id of ["gpu", "adapter:a", "adapter:a:gpu:a:engine:0", "memory:a"])
    assert.equal(isTrackHidden(id, ["gpu"]), true);
  for (const id of ["foreground", "context"]) assert.equal(isTrackHidden(id, ["foreground"]), true);
  for (const id of ["background", "bg-editor"]) assert.equal(isTrackHidden(id, ["background"]), true);
  for (const id of ["battery", "power"]) assert.equal(isTrackHidden(id, ["battery"]), true);
  assert.equal(isTrackHidden("afk", ["idle"]), true);
  assert.equal(isTrackHidden("audioInput", ["audio"]), false);
  assert.equal(isTrackHidden("cpuFrequency", ["cpu"]), false);
  assert.equal(isTrackHidden("performance", ["gpu"]), false);
  assert.equal(isTrackHidden("activity", ["foreground", "background", "idle"]), true);
  for (const id of ["activity", "performance", "sound"]) assert.equal(isTrackHidden(id, trackSources), true);
  assert.equal(isTrackHidden("custom-track", trackSources), false);
});
