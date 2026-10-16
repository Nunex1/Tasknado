import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
try {
  const state = JSON.parse(
    execFileSync(process.execPath, [cli, "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (state.API_URL !== "http://127.0.0.1:55431" || !state.SERVICE_ROLE_KEY)
    throw Error("The isolated local stack is unavailable.");
  const result = spawnSync(process.execPath, ["scripts/integration.mjs"], {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY },
  });
  process.exitCode = result.status ?? 1;
} catch {
  console.error(
    "Local integration cannot run: start the isolated Supabase stack with pnpm local:setup.",
  );
  process.exitCode = 1;
}
