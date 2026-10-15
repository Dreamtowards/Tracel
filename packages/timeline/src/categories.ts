import type { Application } from "./model";

export type Category = { id: string; name: string; parentId?: string; color?: string };
export type CategoryConfig = { version: 1; categories: Category[]; rules: { exe: string; categoryId: string }[] };
export const uncategorized: Category = { id: "__uncategorized", name: "Uncategorized", color: "#92929c" };

/** Validate user-edited configuration before replacing a working configuration. */
export function parseCategories(value: unknown): CategoryConfig {
  const config = value as CategoryConfig;
  if (!config || config.version !== 1 || !Array.isArray(config.categories) || !Array.isArray(config.rules) || config.categories.length > 500 || config.rules.length > 5000) throw new Error("Invalid category configuration (version 1 required).");
  const byId = new Map<string, Category>();
  for (const category of config.categories) {
    if (!category || typeof category.id !== "string" || !category.id || category.id === uncategorized.id || byId.has(category.id) || typeof category.name !== "string" || !category.name.trim() || (category.parentId !== undefined && typeof category.parentId !== "string") || (category.color !== undefined && !/^#[0-9a-f]{6}$/i.test(category.color))) throw new Error("Invalid or duplicate category.");
    byId.set(category.id, category);
  }
  for (const category of config.categories) {
    const seen = new Set([category.id]);
    let parent = category.parentId;
    while (parent !== undefined) {
      if (!byId.has(parent) || seen.has(parent)) throw new Error("Unknown parent or category cycle.");
      seen.add(parent); parent = byId.get(parent)!.parentId;
    }
  }
  const executables = new Set<string>();
  for (const rule of config.rules) {
    if (!rule || typeof rule.exe !== "string" || !rule.exe.trim() || !byId.has(rule.categoryId)) throw new Error("Invalid category rule.");
    const exe = normalize(rule.exe);
    if (executables.has(exe)) throw new Error("Duplicate executable rule.");
    executables.add(exe);
  }
  return config;
}
const normalize = (exe: string) => exe.trim().replaceAll("\\", "/").toLowerCase();
export function categoryResolver(config: CategoryConfig) {
  const byId = new Map(config.categories.map(category => [category.id, category]));
  const rules = new Map(config.rules.map(rule => [normalize(rule.exe), rule.categoryId]));
  const resolve = (app: Application) => {
    const path = normalize(app.exe);
    return byId.get(rules.get(path) ?? rules.get(path.split("/").at(-1) ?? "") ?? "") ?? uncategorized;
  };
  const lineage = (category: Category) => {
    const result = [category];
    while (category.parentId) { category = byId.get(category.parentId)!; result.unshift(category); }
    return result;
  };
  return { resolve, lineage, color: (category: Category) => [...lineage(category)].reverse().find(item => item.color)?.color ?? uncategorized.color! };
}

/** Direct exclusive totals plus parent rollups; never sum parents and children together. */
export function categoryTotals(config: CategoryConfig, apps: (Application & { active: number })[]) {
  const resolver = categoryResolver(config);
  const totals = new Map<string, number>();
  for (const app of apps) for (const category of resolver.lineage(resolver.resolve(app))) totals.set(category.id, (totals.get(category.id) ?? 0) + app.active);
  const ordered: Category[] = [];
  const append = (parentId?: string) => { for (const category of config.categories.filter(item => item.parentId === parentId)) { ordered.push(category); append(category.id); } };
  append(); ordered.push(uncategorized);
  return ordered.filter(category => (totals.get(category.id) ?? 0) > 0).map(category => ({ ...category, active: totals.get(category.id)!, depth: resolver.lineage(category).length - 1, color: resolver.color(category), path: resolver.lineage(category).map(item => item.name).join(" / ") }));
}
