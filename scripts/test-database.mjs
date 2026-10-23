import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const checks = [];
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
await pg.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
grant usage on schema public,auth,storage to anon,authenticated;
grant all on all tables in schema storage to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant all on sequences to anon,authenticated;`);
for (const filename of readdirSync("supabase/migrations").sort()) {
  const sql = readFileSync("supabase/migrations/" + filename, "utf8").replace(
    "create extension if not exists pgcrypto;",
    "-- pgcrypto extension is not needed for built-in gen_random_uuid on embedded PG",
  );
  await pg.exec(sql);
}
pass(
  "All migrations execute in real embedded PostgreSQL (Supabase auth/storage schema harness)",
);
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
await pg.query("insert into auth.users values($1),($2)", [a, b]);
async function as(id) {
  await pg.exec("reset role");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await pg.exec("set role authenticated");
}
async function fails(sql, args = []) {
  let failed = false;
  try {
    await pg.query(sql, args);
  } catch {
    failed = true;
  }
  assert.ok(failed, "Operation must fail: " + sql);
}
await as(a);
const w = (
  await pg.query(
    "insert into workspaces(name) values('Controladoria') returning *",
  )
).rows[0];
const activity = (
  await pg.query(
    "insert into activities(workspace_id,title,status) values($1,'Rateio armazenagem','completed') returning *",
    [w.id],
  )
).rows[0];
assert.equal(activity.status, "not_started");
await fails("update activities set status='completed' where id=$1", [
  activity.id,
]);
await as(b);
assert.equal((await pg.query("select * from workspaces")).rows.length, 0);
await fails(
  "insert into activities(workspace_id,title) values($1,'Intrusão')",
  [w.id],
);
await fails("insert into workspaces(owner_id,name) values($1,'Intrusão')", [a]);
pass(
  "RLS isolates users and composite foreign keys reject cross-account parents",
);
await as(a);
const request = crypto.randomUUID();
await fails("select add_event($1,'resume','Inválido',$2)", [
  activity.id,
  crypto.randomUUID(),
]);
await pg.query("select add_event($1,'check_in','Início',$2)", [
  activity.id,
  request,
]);
await pg.query("select add_event($1,'check_in','Início',$2)", [
  activity.id,
  request,
]);
await fails("select add_event($1,'pause','Reuso inválido',$2)", [
  activity.id,
  request,
]);
for (const type of ["pause", "resume", "observation", "check_out"])
  await pg.query("select add_event($1,$2,$3,$4)", [
    activity.id,
    type,
    "Registro de armazenagem",
    crypto.randomUUID(),
  ]);
assert.deepEqual(
  (
    await pg.query("select type from activity_events order by created_at")
  ).rows.map((e) => e.type),
  ["check_in", "pause", "resume", "observation", "check_out"],
);
await fails("update activity_events set content='Editado'");
await fails("delete from activity_events");
await pg.query("update activities set archived=true where id=$1", [
  activity.id,
]);
await fails("select add_event($1,'observation','Arquivada',$2)", [
  activity.id,
  crypto.randomUUID(),
]);
pass(
  "State machine, idempotency, chronology, archive and immutable history enforced",
);

const university = (
  await pg.query(
    "insert into workspaces(name,category) values('Campus','university') returning *",
  )
).rows[0];
await fails(
  "insert into activities(workspace_id,title) values($1,'Missing choice')",
  [university.id],
);
await fails(
  "insert into activities(workspace_id,title,category_attributes) values($1,'Invalid choice',$2)",
  [university.id, { university: { openedInCanvas: "false" } }],
);
const academic = (
  await pg.query(
    "insert into activities(workspace_id,title,category_attributes) values($1,'Essay',$2) returning *",
    [university.id, { university: { openedInCanvas: false } }],
  )
).rows[0];
assert.equal(academic.status, "not_started");
assert.equal(academic.category_attributes.university.openedInCanvas, false);
await pg.query("update workspaces set category='work' where id=$1", [
  university.id,
]);
await fails("update activities set category_attributes='{}' where id=$1", [
  academic.id,
]);
await pg.query("select set_priority($1,true,false)", [academic.id]);
let planned = (
  await pg.query("select * from activities where id=$1", [academic.id])
).rows[0];
assert.equal(planned.category_attributes.university.openedInCanvas, false);
assert.equal(planned.category_attributes.work.isUrgent, true);
assert.equal(planned.category_attributes.work.isImportant, false);
assert.equal(
  (
    await pg.query("select * from priority_history where activity_id=$1", [
      academic.id,
    ])
  ).rows.length,
  1,
);
await pg.query("select set_priority($1,true,false)", [academic.id]);
assert.equal(
  (
    await pg.query("select * from priority_history where activity_id=$1", [
      academic.id,
    ])
  ).rows.length,
  1,
);
await fails("update activities set category_attributes=$2 where id=$1", [
  academic.id,
  {
    ...planned.category_attributes,
    work: { ...planned.category_attributes.work, hasScheduledDate: true },
  },
]);
await fails("update activities set category_attributes=$2 where id=$1", [
  academic.id,
  {
    ...planned.category_attributes,
    work: {
      ...planned.category_attributes.work,
      hasScheduledDate: true,
      scheduledDate: "2026-02-30",
    },
  },
]);
const scheduled = {
  ...planned.category_attributes,
  work: {
    ...planned.category_attributes.work,
    hasScheduledDate: true,
    scheduledDate: "2026-10-30",
    scheduledTime: "14:00",
  },
};
await pg.query("update activities set category_attributes=$2 where id=$1", [
  academic.id,
  scheduled,
]);
assert.equal(
  (
    await pg.query("select * from priority_history where activity_id=$1", [
      academic.id,
    ])
  ).rows.length,
  1,
);
assert.equal(
  (await pg.query("select status from activities where id=$1", [academic.id]))
    .rows[0].status,
  "not_started",
);
await pg.query("update workspaces set category='sports' where id=$1", [
  university.id,
]);
await fails("select set_priority($1,false,true)", [academic.id]);
await pg.query("update activities set title='Still available' where id=$1", [
  academic.id,
]);
assert.deepEqual(
  (
    await pg.query("select category_attributes from activities where id=$1", [
      academic.id,
    ])
  ).rows[0].category_attributes,
  scheduled,
);
await pg.query("update workspaces set category='university' where id=$1", [
  university.id,
]);
pass(
  "Explicit boolean Canvas choice, category preservation, schedule validation and independent audited priority",
);
const observation = (
  await pg.query("select (add_event($1,'observation','Original',$2)).*", [
    academic.id,
    crypto.randomUUID(),
  ])
).rows[0];
const observationFile = crypto.randomUUID();
await pg.query(
  "insert into attachments(id,activity_id,event_id,name,path,mime,size) values($1,$2,$3,'context.txt',$4,'text/plain',10)",
  [observationFile, academic.id, observation.id, a + "/" + observationFile],
);
await pg.query("select edit_observation($1,'Edited','Original')", [
  observation.id,
]);
const edited = (
  await pg.query("select * from activity_events where id=$1", [observation.id])
).rows[0];
assert.equal(String(edited.created_at), String(observation.created_at));
assert.ok(edited.edited_at);
await fails("select edit_observation($1,'Stale','Original')", [observation.id]);
await as(b);
await fails("select edit_observation($1,'Intrusion','Edited')", [
  observation.id,
]);
await fails("select delete_observation($1,'Edited')", [observation.id]);
await fails("select set_priority($1,true,true)", [academic.id]);
assert.equal((await pg.query("select * from priority_history")).rows.length, 0);
await as(a);
const execution = (
  await pg.query("select (add_event($1,'check_in','Started',$2)).*", [
    academic.id,
    crypto.randomUUID(),
  ])
).rows[0];
await fails("select edit_observation($1,'Changed','Started')", [execution.id]);
await fails("select delete_observation($1,'Started')", [execution.id]);
await pg.query("select delete_observation($1,'Edited')", [observation.id]);
assert.equal(
  (
    await pg.query("select event_id from attachments where id=$1", [
      observationFile,
    ])
  ).rows[0].event_id,
  null,
);
assert.equal(
  (
    await pg.query("select * from activity_events where id=$1", [
      observation.id,
    ])
  ).rows.length,
  0,
);
pass(
  "Observation editing preserves creation time, detects conflicts and isolates owners while execution events remain immutable",
);
await pg.query("select delete_workspace($1)", [university.id]);
assert.equal((await pg.query("select * from priority_history")).rows.length, 0);
const n = (
  await pg.query(
    "insert into notes(workspace_id,title) values($1,'Rotina de armazenagem') returning *",
    [w.id],
  )
).rows[0];
const e = (
  await pg.query(
    "insert into note_entries(note_id,content) values($1,'Primeira versão') returning *",
    [n.id],
  )
).rows[0];
await pg.query("select save_entry($1,$2,1)", [e.id, "Armazenagem revisada"]);
await fails("select save_entry($1,$2,1)", [e.id, "Sobrescrita antiga"]);
assert.equal(
  (await pg.query("select content from note_entries where id=$1", [e.id]))
    .rows[0].content,
  "Armazenagem revisada",
);
pass("Optimistic note revision prevents stale overwrite");
const general = (
  await pg.query(
    "insert into workspace_observations(workspace_id,content) values($1,'Observação geral pesquisável') returning *",
    [w.id],
  )
).rows[0];
assert.deepEqual(general.created_at, general.updated_at);
await pg.query(
  "update workspace_observations set content='Observação geral revisada' where id=$1",
  [general.id],
);
assert.deepEqual(
  (
    await pg.query(
      "select created_at from workspace_observations where id=$1",
      [general.id],
    )
  ).rows[0].created_at,
  general.created_at,
);
assert.ok(
  (await pg.query("select * from search_all('revisada')")).rows.some(
    (r) => r.kind === "workspace_observation",
  ),
);
await fails("update workspace_observations set created_at=now() where id=$1", [
  general.id,
]);
await fails(
  "insert into workspace_events(owner_id,workspace_id,source_id,action) values($1,$2,$3,'forged')",
  [a, w.id, general.id],
);
await as(b);
assert.equal(
  (await pg.query("select * from workspace_observations")).rows.length,
  0,
);
assert.equal(
  (await pg.query("select * from workspace_timeline($1)", [w.id])).rows.length,
  0,
);
await fails(
  "insert into workspace_observations(workspace_id,content) values($1,'intrusion')",
  [w.id],
);
await as(a);
await pg.query("delete from workspace_observations where id=$1", [general.id]);
assert.ok(
  (await pg.query("select * from workspace_timeline($1)", [w.id])).rows.some(
    (r) => r.action === "observation_deleted",
  ),
);
pass(
  "Workspace observations preserve timestamps, search updates, history snapshots and ownership; forged history and timestamps rejected",
);
const file = crypto.randomUUID(),
  path = a + "/" + file;
await pg.query(
  "insert into attachments(id,activity_id,name,path,mime,size) values($1,$2,'rateio.txt',$3,'text/plain',30)",
  [file, activity.id, path],
);
await pg.query(
  "insert into storage.objects(bucket_id,name) values('attachments',$1)",
  [path],
);
assert.equal((await pg.query("select * from storage.objects")).rows.length, 1);
await as(b);
assert.equal((await pg.query("select * from storage.objects")).rows.length, 0);
await fails(
  "insert into storage.objects(bucket_id,name) values('attachments',$1)",
  [a + "/" + crypto.randomUUID()],
);
await fails("select add_event($1,'observation','Intrusão',$2)", [
  activity.id,
  crypto.randomUUID(),
]);
await fails("select save_entry($1,$2,2)", [e.id, "Intrusão"]);
assert.equal(
  (await pg.query("select * from search_all('armazenagem')")).rows.length,
  0,
);
pass("Storage policies, RPCs and search reject another owner");
await as(a);
const results = (await pg.query("select * from search_all('armazenagem')"))
  .rows;
assert.ok(results.some((r) => r.kind === "activity"));
assert.ok(results.some((r) => r.kind === "entry"));
assert.ok(results.some((r) => r.kind === "note"));
assert.ok(results.some((r) => r.kind === "event"));
assert.equal(
  (await pg.query("select * from search_all('rateio',null,'file')")).rows
    .length,
  1,
);
assert.equal(
  (
    await pg.query(
      "select * from search_all('rateio',null,'activity','paused')",
    )
  ).rows.length,
  0,
);
assert.ok((await pg.query("select * from audit_logs")).rows.length > 0);
await fails(
  "insert into audit_logs(owner_id,entity,entity_id,action) values($1,'fake',$2,'fake')",
  [a, w.id],
);
pass("Portuguese full text search, filters and immutable audit logs");
await pg.query("select delete_workspace($1)", [w.id]);
assert.equal((await pg.query("select * from activity_events")).rows.length, 0);
assert.equal((await pg.query("select * from note_entries")).rows.length, 0);
assert.equal((await pg.query("select * from storage.objects")).rows.length, 0);
await pg.exec("reset role");
assert.deepEqual(
  (await pg.query("select path from storage_cleanup order by path")).rows.map(
    (row) => row.path,
  ),
  [path, a + "/" + observationFile].sort(),
);
pass(
  "Deletion cascades records and immediately revokes file visibility; cleanup queued",
);
await pg.exec("set role anon");
await fails("select * from search_all('rateio')");
await fails("insert into workspaces(name) values('Anonymous')");
pass("Anonymous writes and search denied");
await as(a);
await pg.query(
  "insert into workspaces(name) values('Workspace a excluir junto com conta')",
);
await pg.query("select delete_my_account()");
await pg.exec("reset role");
assert.equal(
  (await pg.query("select * from auth.users where id=$1", [a])).rows.length,
  0,
);
assert.equal(
  (await pg.query("select * from workspaces where owner_id=$1", [a])).rows
    .length,
  0,
);
pass("Account deletion cascades data without orphan audit references");
await pg.close();
mkdirSync("test-results", { recursive: true });
writeFileSync(
  "test-results/database.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      checks,
      scope:
        "Embedded real PostgreSQL with Supabase schema harness; does not test live Auth or Storage HTTP",
    },
    null,
    2,
  ),
);
