import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryResolver, categoryTotals, parseCategories } from "../src/categories";
import defaults from "../src/categories.default.json";
import type { Application } from "../src/model";

const app = (exe: string, active = 60): Application & { active: number } => ({ id: exe, exe, active, name: exe, color: "#ffffff", glyph: "" });
test("executable rules normalize Windows paths, prefer exact paths and preserve an exclusive category", () => {
  const config = parseCategories({ ...defaults, rules: [...defaults.rules, { exe: "C:/Special/Code.exe", category_id: "design" }] });
  const resolver = categoryResolver(config);
  assert.equal(resolver.resolve(app("C:\\SPECIAL\\Code.EXE")).id, "design");
  assert.equal(resolver.resolve({ ...app("Code.exe"), executablePath: "C:\\SPECIAL\\Code.EXE" }).id, "design");
  assert.equal(resolver.resolve(app("C:\\Apps\\CODE.exe")).id, "development");
  assert.equal(resolver.resolve(app("unknown-app.exe")).id, "__uncategorized");
  assert.equal(resolver.color(resolver.resolve(app("Code.exe"))), "#8094b8");
});
test("parent totals include children once and changing rules reclassifies existing apps", () => {
  const config = parseCategories(defaults);
  const apps = [app("Code.exe", 40), app("Figma.exe", 20), app("unknown.exe", 10)];
  const totals = categoryTotals(config, apps);
  assert.equal(totals.find(item => item.id === "work")?.active, 60);
  assert.equal(totals.find(item => item.id === "development")?.active, 40);
  assert.equal(totals.filter(item => !item.parent_id).reduce((sum, item) => sum + item.active, 0), 70);
  const changed = parseCategories({ ...defaults, rules: [{ exe: "Code.exe", category_id: "games" }] });
  assert.equal(categoryTotals(changed, apps).find(item => item.id === "entertainment")?.active, 40);
  assert.equal(apps[0].color, "#ffffff", "classification does not mutate source data");
});
test("invalid JSON shapes, missing parents, cycles, colors and ambiguous duplicate rules are rejected", () => {
  for (const value of [null, {}, { version: 2, categories: [], rules: [] },
    { version: 1, categories: [{ id: "a", name: "A", parent_id: "missing" }], rules: [] },
    { version: 1, categories: [{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }], rules: [] },
    { version: 1, categories: [{ id: "a", name: "A", color: "red" }], rules: [] },
    { ...defaults, rules: [{ exe: "code.exe", category_id: "development" }, { exe: "CODE.EXE", category_id: "design" }] }]) assert.throws(() => parseCategories(value));
});

test("default catalogue covers common apps, keeps browsers neutral and uses snake_case only", () => {
  const config = parseCategories(defaults), resolver = categoryResolver(config);
  for (const exe of ["Cursor.exe", "rider64.exe", "rustrover64.exe", "GitHubDesktop.exe", "Unity.exe"]) assert.equal(resolver.resolve(app(exe)).id, "development");
  for (const [exe, id] of [["Feishu.exe", "communication"], ["Weixin.exe", "communication"], ["cloudmusic.exe", "music"], ["JianyingPro.exe", "video_creation"], ["vlc.exe", "video"], ["chrome.exe", "browsing"], ["BaiduNetdiskUnite.exe", "files"], ["clash-verge.exe", "network_tools"]]) assert.equal(resolver.resolve(app(exe)).id, id);
  assert.ok(config.rules.every(rule => !/[\\/]/.test(rule.exe)), "shipped defaults contain no user-specific paths");
  assert.throws(() => parseCategories({ version: 1, categories: [{ id: "a", name: "A", parentId: "b" }], rules: [] }));
  assert.throws(() => parseCategories({ ...defaults, rules: [{ exe: "Code.exe", categoryId: "development" }] }));
});
