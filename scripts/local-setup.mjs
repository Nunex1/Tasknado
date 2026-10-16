import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
const exec = promisify(execFile);
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
try {
  console.log(
    "Starting the isolated Tasknado Supabase stack. Docker must be running.",
  );
  await exec(
    process.execPath,
    [
      cli,
      "start",
      "-x",
      "realtime,imgproxy,edge-runtime,logflare,vector,supavisor",
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  await exec(process.execPath, [cli, "migration", "up", "--local"], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const { stdout } = await exec(process.execPath, [
    cli,
    "status",
    "-o",
    "json",
  ]);
  const state = JSON.parse(stdout);
  if (state.API_URL !== "http://127.0.0.1:55431")
    throw Error("Unexpected local API URL; no environment file was changed.");
  if (!state.ANON_KEY)
    throw Error("CLI did not return the local public anon key.");
  if (existsSync(".env.local")) {
    const current = readFileSync(".env.local", "utf8");
    if (!current.includes(state.API_URL) || !current.includes(state.ANON_KEY))
      throw Error(
        "Existing .env.local has different values. Review it manually; it was not overwritten.",
      );
  } else
    writeFileSync(
      ".env.local",
      `NEXT_PUBLIC_SUPABASE_URL=${state.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${state.ANON_KEY}\n`,
    );
  console.log(
    "Local database migrated and public environment configured. Run pnpm dev. No privileged key was saved.",
  );
} catch (e) {
  console.error(
    "Local setup could not finish. Check Docker Desktop/WSL, then retry. Existing data and environment files are preserved.",
  );
  if (e instanceof Error && !("cmd" in e)) console.error(e.message);
  process.exitCode = 1;
}
