// Disposable container, no host ports, no mounts, no connection to any project.
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const name = `tasknado-security-test-${crypto.randomUUID()}`;
const image = process.env.TASKNADO_TEST_POSTGRES_IMAGE || "postgres:16-alpine";
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
function sql(source, database = "postgres") {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        name,
        "psql",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
      ],
      { windowsHide: true },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (s) => (out += s));
    child.stderr.on("data", (s) => (err += s));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error(err)),
    );
    child.stdin.end(source);
  });
}
try {
  docker(
    "run",
    "--rm",
    "-d",
    "--network",
    "none",
    "--name",
    name,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    image,
  );
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      // The image first starts a socket-only setup server and then restarts it.
      // TCP becomes available only on the final server; accepting the temporary
      // socket here can race its shutdown before the first migration in CI.
      docker("exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres");
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert.ok(ready, "disposable database started");
  const harness = readFileSync("scripts/test-database.mjs", "utf8").match(
    /await pg\.exec\(`([\s\S]*?)`\);/,
  )[1];
  await sql(harness);
  for (const file of readdirSync("supabase/migrations").sort())
    await sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const owner = "11111111-1111-4111-8111-111111111111";
  await sql(`insert into auth.users values('${owner}');
    insert into workspaces(id,owner_id,name) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${owner}','one'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${owner}','two');
    insert into activities(id,owner_id,workspace_id,title) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${owner}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','one'),('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${owner}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','two');
    insert into activity_events(owner_id,activity_id,type,content,request_id) select '${owner}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','observation','seed',gen_random_uuid() from generate_series(1,59);`);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      sql(
        `begin; set local role authenticated; set local request.jwt.claim.sub='${owner}'; select public.add_event('${i % 2 ? "cccccccc-cccc-4ccc-8ccc-cccccccccccc" : "dddddddd-dddd-4ddd-8ddd-dddddddddddd"}','observation','parallel','${crypto.randomUUID()}'); commit;`,
      ),
    ),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  for (const result of outcomes.filter((r) => r.status === "rejected"))
    assert.match(result.reason.message, /Too many events/);
  assert.equal(await sql("select count(*) from activity_events"), "60");
  console.log(
    "PASS 12 concurrent RPC transactions across separate activities/workspaces accept exactly one event at the account limit",
  );
  const privileges = await sql(
    "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (has_table_privilege('anon',c.oid,'TRUNCATE') or has_table_privilege('authenticated',c.oid,'TRUNCATE'))",
  );
  assert.equal(privileges, "0");
  console.log(
    "PASS anon/authenticated cannot TRUNCATE any application table in real PostgreSQL",
  );
  const dump = docker(
    "exec",
    name,
    "pg_dump",
    "-U",
    "postgres",
    "--no-owner",
    "postgres",
  );
  await sql("create database recovery_drill");
  await sql(dump, "recovery_drill");
  assert.equal(
    await sql("select count(*) from activity_events", "recovery_drill"),
    "60",
  );
  assert.equal(
    (
      await sql(
        "set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222'; select count(*) from activities",
        "recovery_drill",
      )
    )
      .split("\n")
      .at(-1),
    "0",
  );
  console.log(
    "PASS synthetic pg_dump restore preserves event data and owner RLS in a second isolated database (Storage bytes not included)",
  );
} finally {
  // Only the UUID-named container created by this invocation is removed.
  try {
    docker("rm", "-f", name);
  } catch {}
}
