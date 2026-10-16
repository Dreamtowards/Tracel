import { mkdirSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const source = path.join(root, "assets/branding/tracel.svg");
const generated = path.join(root, "target/generated-brand-icons");
mkdirSync(generated, { recursive: true });
const result = spawnSync(process.execPath, [path.join(root, "node_modules/@tauri-apps/cli/tauri.js"), "icon", source, "--output", generated], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const file of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.ico", "icon.icns"]) {
  copyFileSync(path.join(generated, file), path.join(root, "apps/desktop/src-tauri/icons", file));
}
copyFileSync(source, path.join(root, "apps/web/src/app/icon.svg"));
