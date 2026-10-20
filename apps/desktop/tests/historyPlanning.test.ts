import { test } from "node:test";
import assert from "node:assert/strict";
import { historyTiles, historyContext, historyBudget, availableHistory, isLiveContinuation } from "../src/historyPlanning";

test("live following stays in the ready state while zooms and large jumps start a new load", () => {
    const previous = { start: 10000, end: 13600 }, now = 13500 * 1000;
    assert.equal(isLiveContinuation(previous, { start: 10002, end: 13602 }, now), true);
    assert.equal(isLiveContinuation(previous, { start: 10000, end: 13602 }, now), false);
    assert.equal(isLiveContinuation(previous, { start: 11000, end: 14600 }, now), false);
    assert.equal(isLiveContinuation(null, previous, now), false);
    assert.equal(isLiveContinuation(previous, { start: 10002, end: 13602 }, 20000 * 1000), false);
});

test("month requests use calendar days, maintain exact coverage and stable cache quality", () => {
    const start = new Date(2026, 9, 1).getTime() / 1000;
    const end = new Date(2026, 9, 31).getTime() / 1000;
    const tiles = historyTiles({ start, end });
    assert.equal(tiles.length, 30);
    assert.equal(tiles[0].range.start, start);
    assert.equal(tiles.at(-1)!.range.end, end);
    for (let i = 1; i < tiles.length; i++) assert.equal(tiles[i - 1].range.end, tiles[i].range.start);
    assert.ok(tiles.every(t => t.range.end - t.range.start <= 25 * 3600));
    const fortnight = historyTiles({start, end: tiles[14].range.end});
    assert.deepEqual(fortnight, tiles.slice(0,15));
    assert.equal(historyBudget(fortnight[0].range), historyBudget(tiles[0].range));
});

test("overview context contains arbitrary continuous spans, including more than a month", () => {
    for (const span of [3600, 123456, 15 * 86400, 30 * 86400, 90 * 86400]) {
        const view = { start: 20_000_000 - span, end: 20_000_000 };
        const context = historyContext(view, {start:0,end:20_000_000});
        assert.ok(context.start <= view.start);
        assert.equal(context.end, view.end);
        assert.ok(context.end - context.start >= span);
    }
});

test("empty history before the first observation is skipped without removing measured support", () => {
    assert.equal(availableHistory({start:0,end:900}, 1_000_000), null);
    assert.deepEqual(availableHistory({start:0,end:1100},1_000_000), {start:994,end:1100});
    assert.deepEqual(availableHistory({start:1001,end:1100},1_000_000), {start:1001,end:1100});
});

test("wide display geometry has a view-wide budget instead of growing with archive days", () => {
    for (const hours of [72,720,5000]) {
        const range = {start:1_000_000_000,end:1_000_000_000+hours*3600};
        const tiles = historyTiles(range);
        const points = tiles.reduce((n,t) => n+historyBudget(t.range,hours*3600),0);
        assert.ok(points <= 2400+256, `${hours} hours: ${points} points`);
        assert.ok(points > 0);
    }
});
