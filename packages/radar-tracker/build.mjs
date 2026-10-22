import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
await mkdir("../../apps/web/public/radar", { recursive: true });
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "../../apps/web/public/radar/tracker.js",
});
console.log(
  `Radar tracker: ${gzipSync(await readFile("../../apps/web/public/radar/tracker.js")).length} bytes gzip`,
);
