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

  // Writers of one account take row locks in different orders (RPC: activity
  // then workspace; direct update: workspace only; insert: parent share lock).
  // The lock-free account limits must not turn that into deadlocks.
  const busy = "33333333-3333-4333-8333-333333333333";
  const space = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    task = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await sql(`insert into auth.users values('${busy}');
    insert into workspaces(id,owner_id,name) values('${space}','${busy}','busy');
    insert into activities(id,owner_id,workspace_id,title) values('${task}','${busy}','${space}','busy');`);
  const as = (statement) =>
    sql(
      `begin; set local role authenticated; set local request.jwt.claim.sub='${busy}'; ${statement}; commit;`,
    );
  const mixed = await Promise.allSettled(
    Array.from({ length: 40 }, (_, i) =>
      as(
        [
          `select public.add_event('${task}','observation','mixed ${i}','${crypto.randomUUID()}')`,
          `update activities set title='busy ${i}' where id='${task}'`,
          `insert into activities(workspace_id,title) values('${space}','new ${i}')`,
          `update workspaces set description='busy ${i}' where id='${space}'`,
          `insert into workspace_observations(workspace_id,content) values('${space}','note ${i}')`,
        ][i % 5],
      ),
    ),
  );
  assert.deepEqual(
    mixed.filter((r) => r.status === "rejected").map((r) => r.reason.message),
    [],
  );
  assert.equal(
    await sql(
      `select count(*) from activities where owner_id='${busy}' and title like 'new %'`,
    ),
    "8",
  );
  console.log(
    "PASS 40 concurrent mixed writes of one account (RPC, updates, inserts) complete without deadlock or lost rows under the account limits",
  );
  // The row ceiling is exact under concurrency.
  await sql(
    `insert into workspaces(owner_id,name) select '${busy}','fill '||g from generate_series(1,195) g`,
  );
  const race = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      as(`insert into workspaces(name) values('race ${i}')`),
    ),
  );
  for (const result of race.filter((r) => r.status === "rejected"))
    assert.match(result.reason.message, /Account limit reached/);
  const total = Number(
    await sql(`select count(*) from workspaces where owner_id='${busy}'`),
  );
  assert.equal(total, 200);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 4);
  assert.match(
    await as("insert into workspaces(name) values('late')").then(
      () => "",
      (error) => error.message,
    ),
    /Account limit reached/,
  );
  console.log(
    "PASS 12 concurrent inserts at the 200-workspace ceiling admit exactly the 4 remaining rows and every later insert is refused",
  );

  // Deployment gate of the quarantine migration, on a database that already
  // stores attachments (the production shape before this change).
  const files = readdirSync("supabase/migrations").sort();
  const quarantine = files.findIndex((file) =>
    file.includes("upload_quarantine"),
  );
  assert.ok(quarantine > 0);
  const apply = (file, database) =>
    sql(readFileSync(`supabase/migrations/${file}`, "utf8"), database);
  await sql("create database gate_drill");
  await sql(harness.replace(/create role [^;]+;/g, ""), "gate_drill");
  for (const file of files.slice(0, quarantine))
    await apply(file, "gate_drill");
  const legacy = "44444444-4444-4444-8444-444444444444",
    file = "99999999-9999-4999-8999-999999999999";
  await sql(
    `insert into auth.users values('${legacy}');
     insert into workspaces(id,owner_id,name) values('${space}','${legacy}','legacy');
     insert into notes(id,owner_id,workspace_id,title) values('${task}','${legacy}','${space}','legacy');
     insert into attachments(id,owner_id,note_id,name,path,mime,size) values('${file}','${legacy}','${task}','old.txt','${legacy}/${file}','text/plain',5);`,
    "gate_drill",
  );
  const columns = () =>
    sql(
      "select count(*) from information_schema.columns where table_schema='public' and table_name='attachments' and column_name='scan_status'",
      "gate_drill",
    );
  await assert.rejects(
    apply(files[quarantine], "gate_drill"),
    /Deployment gate/,
  );
  assert.equal(await columns(), "0");
  assert.equal(
    await sql(
      "select count(*) from pg_policies where policyname='file_delete'",
      "gate_drill",
    ),
    "1",
  );
  console.log(
    "PASS quarantine migration refuses to run on a database with existing attachments and leaves schema and policies untouched",
  );
  await sql(
    "comment on table public.attachments is 'tasknado:scanner-validated'",
    "gate_drill",
  );
  for (const next of files.slice(quarantine)) await apply(next, "gate_drill");
  assert.equal(
    await sql(
      `select scan_status from attachments where id='${file}'`,
      "gate_drill",
    ),
    "pending",
  );
  assert.equal(
    await sql(
      `select reserved_bytes from attachment_paths where path='${legacy}/${file}'`,
      "gate_drill",
    ),
    "20971520",
  );
  // The migrations that declare themselves repeatable can be applied again.
  const repeatable = files.filter((name) =>
    /account_limits|security_metrics|activity_write_deadlock|professional_plan_limits/.test(
      name,
    ),
  );
  assert.equal(repeatable.length, 4);
  for (const again of repeatable) await apply(again, "gate_drill");
  assert.equal(
    await sql(
      "select count(*) from pg_trigger where tgname='account_limits' and not tgisinternal",
      "gate_drill",
    ),
    "8",
  );
  console.log(
    "PASS after the operator records scanner validation the quarantine applies, existing files start pending with a full reservation, and the four repeatable migrations apply a second time",
  );
} finally {
  // Only the UUID-named container created by this invocation is removed.
  try {
    docker("rm", "-f", name);
  } catch {}
}
