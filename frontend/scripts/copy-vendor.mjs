// Copies MapLibre's self-contained module worker into /public so it can be served same-origin.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("maplibre-gl/package.json"));
const out = join(process.cwd(), "public", "vendor");
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, "dist", "maplibre-gl-worker.mjs"), join(out, "maplibre-gl-worker.mjs"));
console.log("copied maplibre-gl-worker.mjs → public/vendor/");
