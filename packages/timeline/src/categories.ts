import type { Application, ActivityContext } from "./model";

export type Category = { id: string; name: string; parent_id?: string; color?: string };
export type CategoryConfig = { version: 1; categories: Category[]; rules: { exe: string; category_id: string }[] };
export const uncategorized: Category = { id: "__uncategorized", name: "Uncategorized", color: "#92929c" };

/** Validate user-edited configuration before replacing a working configuration. */
export function parseCategories(value: unknown): CategoryConfig {
  const config = value as CategoryConfig;
  if (!config || config.version !== 1 || !Array.isArray(config.categories) || !Array.isArray(config.rules) || config.categories.length > 500 || config.rules.length > 5000) throw new Error("Invalid category configuration (version 1 required).");
  const byId = new Map<string, Category>();
  for (const category of config.categories) {
    if (category && Object.keys(category).some(key => !["id", "name", "parent_id", "color"].includes(key))) throw new Error("Unknown category key. Use parent_id for the parent category.");
    if (!category || typeof category.id !== "string" || !category.id || category.id === uncategorized.id || byId.has(category.id) || typeof category.name !== "string" || !category.name.trim() || (category.parent_id !== undefined && typeof category.parent_id !== "string") || (category.color !== undefined && !/^#[0-9a-f]{6}$/i.test(category.color))) throw new Error("Invalid or duplicate category.");
    byId.set(category.id, category);
  }
  for (const category of config.categories) {
    const seen = new Set([category.id]);
    let parent = category.parent_id;
    while (parent !== undefined) {
      if (!byId.has(parent) || seen.has(parent)) throw new Error("Unknown parent or category cycle.");
      seen.add(parent); parent = byId.get(parent)!.parent_id;
    }
  }
  const executables = new Set<string>();
  for (const rule of config.rules) {
    if (rule && Object.keys(rule).some(key => !["exe", "category_id"].includes(key))) throw new Error("Unknown rule key. Use category_id for the target category.");
    if (!rule || typeof rule.exe !== "string" || !rule.exe.trim() || !byId.has(rule.category_id)) throw new Error("Invalid category rule.");
    const exe = normalize(rule.exe);
    if (executables.has(exe)) throw new Error("Duplicate executable rule.");
    executables.add(exe);
  }
  return config;
}
const normalize = (exe: string) => exe.trim().replaceAll("\\", "/").toLowerCase();
type Usage = Application & { active: number; foreground?: number; contexts?: ActivityContext[]; memberIds?: string[] };
/** Presentation identity: app updates and pathless process observations remain one app.
 * Full archive identities and path-specific category overrides remain intact. */
export function applicationGroups<T extends Usage>(config: CategoryConfig | undefined, apps: readonly T[]) {
  const resolver = config ? categoryResolver(config) : null;
  const groups = new Map<string, T & { memberIds: string[] }>();
  for (const app of apps) {
    const executable = normalize(app.exe || app.executablePath || app.name).split("/").at(-1)!.replace(/\.exe$/, "").replace(/\s+/g, "");
    const key = `${resolver?.resolve(app).id ?? ""}:${executable || app.id}`;
    const old = groups.get(key);
    if (old) {
      old.active += app.active;
      if (app.foreground !== undefined) old.foreground = (old.foreground ?? 0) + app.foreground;
      if (app.contexts) old.contexts = [...(old.contexts ?? []), ...app.contexts];
      old.memberIds.push(...(app.memberIds ?? [app.id]));
      if (!old.executablePath && app.executablePath) old.executablePath = app.executablePath;
    } else groups.set(key, { ...app, contexts: app.contexts?.slice(), memberIds: [...(app.memberIds ?? [app.id])] });
  }
  for (const app of groups.values()) app.contexts?.sort((a,b) => a.start - b.start);
  return [...groups.values()].sort((a,b) => b.active - a.active || a.name.localeCompare(b.name));
}
/** Active applications in each category, including descendants, sorted by time. */
export function categoryApplications<T extends Application & { active: number }>(config: CategoryConfig, apps: readonly T[]) {
  const resolver = categoryResolver(config);
  const groups = new Map<string, (T & { memberIds: string[] })[]>();
  for (const app of applicationGroups(config, apps)) {
    if (app.active <= 0) continue;
    for (const category of resolver.lineage(resolver.resolve(app))) {
      const members = groups.get(category.id) ?? [];
      members.push(app);
      groups.set(category.id, members);
    }
  }
  for (const members of groups.values()) members.sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  return groups;
}
export function categoryResolver(config: CategoryConfig) {
  const byId = new Map(config.categories.map(category => [category.id, category]));
  const rules = new Map(config.rules.map(rule => [normalize(rule.exe), rule.category_id]));
  const resolve = (app: Application) => {
    const path = normalize(app.executablePath || app.exe || app.name);
    const filename = path.split("/").at(-1) ?? "";
    return byId.get(rules.get(path) ?? rules.get(filename) ?? rules.get(`${filename}.exe`) ?? "") ?? uncategorized;
  };
  const lineage = (category: Category) => {
    const result = [category];
    while (category.parent_id) { category = byId.get(category.parent_id)!; result.unshift(category); }
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
  const append = (parent_id?: string) => { for (const category of config.categories.filter(item => item.parent_id === parent_id)) { ordered.push(category); append(category.id); } };
  append(); ordered.push(uncategorized);
  return ordered.filter(category => (totals.get(category.id) ?? 0) > 0).map(category => ({ ...category, active: totals.get(category.id)!, depth: resolver.lineage(category).length - 1, color: resolver.color(category), path: resolver.lineage(category).map(item => item.name).join(" / ") }));
}
