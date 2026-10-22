import { build } from "esbuild";
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "dist/index.js",
  sourcemap: true,
});
