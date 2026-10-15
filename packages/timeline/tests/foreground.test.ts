import { test } from "node:test";
import assert from "node:assert/strict";
import { foregroundAppIntervals } from "../src/foreground";
import type { ActivityInterval, Application } from "../src/model";

const apps: Application[] = [
  { id: "chrome", exe: "C:\\Apps\\Chrome.exe", name: "Chrome", color: "#ffffff", glyph: "" },
  { id: "chrome2", exe: "c:/apps/CHROME.EXE", name: "Chrome", color: "#ffffff", glyph: "" },
  { id: "editor", exe: "C:\\Editor.exe", name: "Editor", color: "#ffffff", glyph: "" },
  { id: "unknown", exe: "", name: "Unknown", color: "#ffffff", glyph: "" },
];
const interval = (start: number, end: number, appId: string, title: string): ActivityInterval => ({
  id: `${start}`, start, end, appId, windowTitle: title, windowId: title, processInstanceId: title,
  contexts: [{ start, end, kind: "window", title, value: title }],
});

test("foreground groups consecutive EXE use across title, window and process changes without losing contexts", () => {
  const activity = [interval(0, 10, "chrome", "Tab A"), interval(10, 20, "chrome", "Tab B"), interval(20, 30, "chrome2", "Other window")];
  const original = structuredClone(activity);
  assert.deepEqual(foregroundAppIntervals(activity, apps), [{ start: 0, end: 30, appId: "chrome" }]);
  assert.deepEqual(activity, original, "source intervals and their hover contexts remain unchanged");
});

test("foreground preserves app switches, return visits and unobserved gaps", () => {
  const activity = [interval(0, 10, "chrome", "A"), interval(10, 20, "editor", "B"), interval(20, 30, "chrome", "C"), interval(35, 40, "chrome", "D"), interval(40, 45, "unknown", "E"), interval(45, 50, "unknown", "F")];
  assert.deepEqual(foregroundAppIntervals(activity, apps), [
    { start: 0, end: 10, appId: "chrome" }, { start: 10, end: 20, appId: "editor" },
    { start: 20, end: 30, appId: "chrome" }, { start: 35, end: 40, appId: "chrome" },
    { start: 40, end: 50, appId: "unknown" },
  ]);
});
