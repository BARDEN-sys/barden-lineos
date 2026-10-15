// Writes public/sw.js from the template with a unique build id, so each deploy
// produces a changed service worker and installed phones update automatically.
import { readFileSync, writeFileSync } from "node:fs";

const id = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || Date.now().toString(36);
const src = readFileSync(new URL("./sw.template.js", import.meta.url), "utf8");
writeFileSync(new URL("../public/sw.js", import.meta.url), src.replaceAll("__BUILD__", id));
console.log(`service worker build ${id}`);
