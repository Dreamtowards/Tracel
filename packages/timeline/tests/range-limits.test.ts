import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRange, zoomRange, duration, MAX_VIEW_SECONDS, DAY } from "../src/model";

test("all zoom and range entry paths cap at 5000 hours while preserving the zoom anchor", () => {
  const bounds = {start:0,end:100_000_000}, view = {start:40_000_000,end:40_003_600};
  const center = (view.start+view.end)/2;
  const next = zoomRange(view,15000,center,bounds);
  assert.equal(next.end-next.start,MAX_VIEW_SECONDS);
  assert.equal((next.start+next.end)/2,center);
  assert.deepEqual(zoomRange(next,2,center,bounds),next);
  const direct = clampRange({start:1,end:15000*3600},bounds);
  assert.equal(direct.end-direct.start,5000*3600);
  assert.equal(duration(MAX_VIEW_SECONDS),"208d 8h");
  assert.equal(duration(DAY),"1d");
  assert.equal(duration(DAY+3*3600+5*60),"1d 3h 5m");
});
