import { spawnSync } from "node:child_process";
import { localStack } from "./security-stack.mjs";
try {
  const state = localStack();
  if (!state.SERVICE_ROLE_KEY)
    throw Error("The isolated local stack is unavailable.");
  const result = spawnSync(process.execPath, ["scripts/integration.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SUPABASE_SERVICE_ROLE_KEY: state.SERVICE_ROLE_KEY,
      // Only set for the isolated security stack; otherwise .env.local decides.
      ...(process.env.TASKNADO_TEST_STACK === "security" && {
        TASKNADO_TEST_API_URL: state.API_URL,
        TASKNADO_TEST_ANON_KEY: state.ANON_KEY,
      }),
    },
  });
  process.exitCode = result.status ?? 1;
} catch {
  console.error(
    "Local integration cannot run: start the isolated Supabase stack with pnpm local:setup.",
  );
  process.exitCode = 1;
}
