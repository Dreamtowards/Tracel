import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryResolver, categoryTotals, parseCategories } from "../src/categories";
import defaults from "../src/categories.default.json";
import type { Application } from "../src/model";

const app = (exe: string, active = 60): Application & { active: number } => ({ id: exe, exe, active, name: exe, color: "#ffffff", glyph: "" });
test("executable rules normalize Windows paths, prefer exact paths and preserve an exclusive category", () => {
  const config = parseCategories({ ...defaults, rules: [...defaults.rules, { exe: "C:/Special/Code.exe", categoryId: "design" }] });
  const resolver = categoryResolver(config);
  assert.equal(resolver.resolve(app("C:\\SPECIAL\\Code.EXE")).id, "design");
  assert.equal(resolver.resolve({ ...app("Code.exe"), executablePath: "C:\\SPECIAL\\Code.EXE" }).id, "design");
  assert.equal(resolver.resolve(app("C:\\Apps\\CODE.exe")).id, "development");
  assert.equal(resolver.resolve(app("chrome.exe")).id, "__uncategorized");
  assert.equal(resolver.color(resolver.resolve(app("Code.exe"))), "#8094b8");
});
test("parent totals include children once and changing rules reclassifies existing apps", () => {
  const config = parseCategories(defaults);
  const apps = [app("Code.exe", 40), app("Figma.exe", 20), app("unknown.exe", 10)];
  const totals = categoryTotals(config, apps);
  assert.equal(totals.find(item => item.id === "work")?.active, 60);
  assert.equal(totals.find(item => item.id === "development")?.active, 40);
  assert.equal(totals.filter(item => !item.parentId).reduce((sum, item) => sum + item.active, 0), 70);
  const changed = parseCategories({ ...defaults, rules: [{ exe: "Code.exe", categoryId: "games" }] });
  assert.equal(categoryTotals(changed, apps).find(item => item.id === "entertainment")?.active, 40);
  assert.equal(apps[0].color, "#ffffff", "classification does not mutate source data");
});
test("invalid JSON shapes, missing parents, cycles, colors and ambiguous duplicate rules are rejected", () => {
  for (const value of [null, {}, { version: 2, categories: [], rules: [] },
    { version: 1, categories: [{ id: "a", name: "A", parentId: "missing" }], rules: [] },
    { version: 1, categories: [{ id: "a", name: "A", parentId: "b" }, { id: "b", name: "B", parentId: "a" }], rules: [] },
    { version: 1, categories: [{ id: "a", name: "A", color: "red" }], rules: [] },
    { ...defaults, rules: [{ exe: "code.exe", categoryId: "development" }, { exe: "CODE.EXE", categoryId: "design" }] }]) assert.throws(() => parseCategories(value));
});
