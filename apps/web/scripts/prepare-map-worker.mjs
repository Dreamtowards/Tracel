import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// MapLibre 6 workers import a sibling shared module. Turbopack does not
// preserve that layout for emitted assets, so serve both matching files locally.
const require = createRequire(import.meta.url);
const distribution = join(
  dirname(require.resolve("maplibre-gl/package.json")),
  "dist",
);
const destination = new URL("../public/maplibre/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(distribution, file), new URL(file, destination));
}
console.log("Map worker and shared module prepared.");
