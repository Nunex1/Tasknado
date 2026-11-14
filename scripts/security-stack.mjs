// A second local Supabase stack used only by the security tests. It has its
// own project id, containers, volumes and ports (5643x), so the tests can
// create accounts, quarantine files and reset the database without touching
// the development stack (5543x) or any hosted project.
//
//   node scripts/security-stack.mjs start | migrate | reset | status | stop
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SECURITY_API_URL = "http://127.0.0.1:56431";
const cli = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");
// Inside the checkout (ignored by Git), not in the shared temp directory, so
// no other local user can prepare or replace the configuration the CLI reads.
const workdir = join("node_modules", ".cache", "tasknado-security-stack");

// The CLI reads everything from <workdir>/supabase. Rebuilt on every call so
// it always holds the migrations of the current checkout.
function prepare() {
  const target = join(workdir, "supabase");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync("supabase/migrations", join(target, "migrations"), {
    recursive: true,
  });
  const config = readFileSync("supabase/config.toml", "utf8")
    .replace('project_id = "tasknado"', 'project_id = "tasknado_security"')
    .replace(/\b5543(\d)\b/g, "5643$1");
  if (
    !config.includes('project_id = "tasknado_security"') ||
    /\b5543\d\b/.test(config)
  )
    throw Error("Could not derive the isolated stack configuration.");
  writeFileSync(join(target, "config.toml"), config);
}

function supabase(args, options = {}) {
  prepare();
  return execFileSync(process.execPath, [cli, ...args, "--workdir", workdir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

/** Connection details of the isolated stack; refuses any other target. */
export function securityStack() {
  const state = JSON.parse(
    supabase(["status", "-o", "json"], { stdio: ["ignore", "pipe", "pipe"] }),
  );
  if (state.API_URL !== SECURITY_API_URL)
    throw Error("The isolated security stack is not the one running.");
  return state;
}

/**
 * Stack for the regression suites: the development one unless
 * TASKNADO_TEST_STACK=security asks for the isolated one. Never a remote URL.
 */
export function localStack() {
  if (process.env.TASKNADO_TEST_STACK === "security") return securityStack();
  const state = JSON.parse(
    execFileSync(process.execPath, [cli, "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (state.API_URL !== "http://127.0.0.1:55431")
    throw Error("The local development stack is not the one running.");
  return state;
}

const commands = {
  start: [
    "start",
    "-x",
    "realtime,imgproxy,edge-runtime,logflare,vector,supavisor,studio,postgres-meta",
  ],
  migrate: ["migration", "up", "--local"],
  // Destroys and recreates the isolated database only.
  reset: ["db", "reset", "--local"],
  stop: ["stop"],
};
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "status") {
    const state = securityStack();
    // Never print the keys the CLI returns.
    console.log(JSON.stringify({ API_URL: state.API_URL, DB_URL: "hidden" }));
  } else if (commands[command]) {
    supabase(commands[command], { stdio: "inherit" });
  } else {
    console.error("Usage: security-stack.mjs start|migrate|reset|status|stop");
    process.exitCode = 1;
  }
}
