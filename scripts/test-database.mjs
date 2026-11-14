import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const checks = [];
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
await pg.exec(`create role service_role bypassrls; create role anon; create role authenticated; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
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

// Reopening uses the existing transactional, owner-scoped event RPC.
await fails("select add_event($1,'resume','Archived reopen',$2)", [
  activity.id,
  crypto.randomUUID(),
]);
await pg.query("update activities set archived=false where id=$1", [
  activity.id,
]);
await as(b);
await fails("select add_event($1,'resume','Foreign reopen',$2)", [
  activity.id,
  crypto.randomUUID(),
]);
await as(a);
const reopenRequest = crypto.randomUUID();
for (let i = 0; i < 2; i++)
  await pg.query("select add_event($1,'resume','Reopened',$2)", [
    activity.id,
    reopenRequest,
  ]);
assert.equal(
  (await pg.query("select status from activities where id=$1", [activity.id]))
    .rows[0].status,
  "in_progress",
);
assert.equal(
  (
    await pg.query("select * from activity_events where request_id=$1", [
      reopenRequest,
    ])
  ).rows.length,
  1,
);
await pg.query("select add_event($1,'check_out','Completed again',$2)", [
  activity.id,
  crypto.randomUUID(),
]);
await pg.query("update activities set archived=true where id=$1", [
  activity.id,
]);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from activities where status='completed' and workspace_id=$1",
      [w.id],
    )
  ).rows[0].n,
  1,
);
pass(
  "Reopening preserves authorization, idempotency and history; completion includes archives",
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

// Granular notebook deletion: owner-scoped functions only, direct DELETE stays closed.
const rows = async (sql, args = []) => (await pg.query(sql, args)).rows;
const draft = (
  await rows(
    "insert into notes(workspace_id,title) values($1,'Nota descartável') returning *,updated_at::text stamp",
    [w.id],
  )
)[0];
const keptNote = (
  await rows(
    "insert into notes(workspace_id,title) values($1,'Nota preservada') returning *",
    [w.id],
  )
)[0];
const blocks = [];
for (const content of ["Bloco um", "Bloco dois", "Bloco três"])
  blocks.push(
    (
      await rows(
        "insert into note_entries(note_id,content) values($1,$2) returning *",
        [draft.id, content],
      )
    )[0],
  );
const keptBlock = (
  await rows(
    "insert into note_entries(note_id,content) values($1,'Bloco preservado') returning *",
    [keptNote.id],
  )
)[0];
const noteFile = crypto.randomUUID();
await pg.query(
  "insert into attachments(id,note_id,name,path,mime,size) values($1,$2,'anexo.txt',$3,'text/plain',12)",
  [noteFile, draft.id, a + "/" + noteFile],
);
const draftBlocks = () =>
  rows("select id from note_entries where note_id=$1 order by created_at,id", [
    draft.id,
  ]).then((list) => list.map((row) => row.id));
await fails("delete from note_entries where id=$1", [blocks[0].id]);
await pg.query("delete from notes where id=$1", [draft.id]).catch(() => {});
assert.equal(
  (await rows("select 1 from notes where id=$1", [draft.id])).length,
  1,
);
// A block is only deleted through the note it belongs to.
await fails("select delete_entry($1,$2)", [blocks[0].id, keptNote.id]);
await as(b);
await fails("select delete_entry($1,$2)", [blocks[0].id, draft.id]);
await fails("select delete_note($1)", [draft.id]);
await pg.exec("reset role");
await pg.query("select set_config('request.jwt.claim.sub','',false)");
await pg.exec("set role anon");
await fails("select delete_entry($1,$2)", [blocks[0].id, draft.id]);
await fails("select delete_note($1)", [draft.id]);
await pg.exec("reset role");
await pg.exec("set role authenticated");
await fails("select delete_entry($1,$2)", [blocks[0].id, draft.id]);
await fails("select delete_note($1)", [draft.id]);
await as(a);
assert.deepEqual(
  await draftBlocks(),
  blocks.map((block) => block.id),
);
pass(
  "Direct deletes, wrong-note, other-owner, anonymous and session-less deletions leave notes and blocks untouched",
);
await pg.query("select delete_entry($1,$2)", [blocks[1].id, draft.id]);
assert.deepEqual(await draftBlocks(), [blocks[0].id, blocks[2].id]);
assert.equal(
  (
    await rows(
      "select updated_at>$2::timestamptz touched from notes where id=$1",
      [draft.id, draft.stamp],
    )
  )[0].touched,
  true,
);
await fails("select delete_entry($1,$2)", [blocks[1].id, draft.id]);
// A save that arrives after the deletion fails and cannot recreate the block.
await fails("select save_entry($1,'Gravação atrasada',1)", [blocks[1].id]);
assert.equal(
  (await rows("select 1 from note_entries where id=$1", [blocks[1].id])).length,
  0,
);
await pg.query("select save_entry($1,'Bloco um revisado',1)", [blocks[0].id]);
await pg.query("select delete_entry($1,$2)", [blocks[0].id, draft.id]);
await pg.query("select delete_entry($1,$2)", [blocks[2].id, draft.id]);
assert.deepEqual(await draftBlocks(), []);
assert.equal(
  (await rows("select 1 from notes where id=$1", [draft.id])).length,
  1,
);
const refill = (
  await rows(
    "insert into note_entries(note_id,content) values($1,'Conteúdo novo') returning *",
    [draft.id],
  )
)[0];
assert.equal(
  (await rows("select 1 from note_entries where id=$1", [keptBlock.id])).length,
  1,
);
pass(
  "Block deletion removes one block, keeps order, the note and its other blocks, touches the note, rejects repeats and late saves; an emptied note accepts new blocks",
);
await pg.query("select delete_note($1)", [draft.id]);
for (const [sql, id] of [
  ["select 1 from notes where id=$1", draft.id],
  ["select 1 from note_entries where note_id=$1", draft.id],
  ["select 1 from attachments where id=$1", noteFile],
])
  assert.equal((await rows(sql, [id])).length, 0);
await fails("select delete_note($1)", [draft.id]);
await fails("select save_entry($1,'Gravação atrasada',1)", [refill.id]);
await fails("insert into note_entries(note_id,content) values($1,'Órfão')", [
  draft.id,
]);
for (const [sql, id] of [
  ["select 1 from notes where id=$1", keptNote.id],
  ["select 1 from note_entries where id=$1", keptBlock.id],
  ["select 1 from notes where id=$1", n.id],
  ["select 1 from note_entries where id=$1", e.id],
  ["select 1 from workspaces where id=$1", w.id],
  ["select 1 from activities where id=$1", activity.id],
])
  assert.equal((await rows(sql, [id])).length, 1);
assert.deepEqual(
  (
    await rows(
      "select entity,count(*)::int n from audit_logs where action='DELETE' and entity_id=any($1::uuid[]) group by entity order by entity",
      [[draft.id, refill.id, noteFile, ...blocks.map((block) => block.id)]],
    )
  ).map((row) => [row.entity, row.n]),
  [
    ["attachments", 1],
    ["note_entries", 4],
    ["notes", 1],
  ],
);
await pg.exec("reset role");
assert.equal(
  (
    await rows("select 1 from storage_cleanup where path=$1", [
      a + "/" + noteFile,
    ])
  ).length,
  1,
);
await as(a);
pass(
  "Note deletion removes the note with its blocks and file records in one step, queues storage cleanup, audits it, blocks late writes and preserves every other record",
);
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
assert.equal((await pg.query("select * from storage.objects")).rows.length, 0);
await fails("update attachments set scan_status='clean' where id=$1", [file]);
await fails("truncate attachments cascade");
await fails("select reserve_attachment_path()");
await pg.exec("reset role");
await pg.query("update attachments set scan_status='clean' where id=$1", [
  file,
]);
await as(a);
assert.equal((await pg.query("select * from storage.objects")).rows.length, 1);
await fails(
  "insert into storage.objects(bucket_id,name) values('attachments',$1)",
  [path],
);
assert.equal(
  (
    await pg.query("delete from storage.objects where name=$1 returning id", [
      path,
    ])
  ).rows.length,
  0,
);
pass(
  "Quarantine hides pending bytes, denies client verdicts, replacement/deletion and RLS-bypassing privileges",
);
const disposable = crypto.randomUUID(),
  disposablePath = a + "/" + disposable;
await pg.query(
  "insert into attachments(id,activity_id,name,path,mime,size) values($1,$2,'deleted.txt',$3,'text/plain',1)",
  [disposable, activity.id, disposablePath],
);
await pg.query("delete from attachments where id=$1", [disposable]);
await assert.rejects(
  pg.query(
    "insert into attachments(id,activity_id,name,path,mime,size) values($1,$2,'reused.txt',$3,'text/plain',1)",
    [disposable, activity.id, disposablePath],
  ),
  /duplicate key/,
);
await pg.exec("reset role");
assert.equal(
  Number(
    (
      await pg.query(
        "select reserved_bytes from attachment_paths where path=$1",
        [disposablePath],
      )
    ).rows[0].reserved_bytes,
  ),
  20971520,
);
// Keep the existing cleanup expectations focused on their own fixtures.
await pg.query("delete from storage_cleanup where path=$1", [disposablePath]);
await pg.exec("begin");
await pg.query(
  "insert into attachment_paths(path,owner_id) select $1::text || '/' || gen_random_uuid()::text,$1::uuid from generate_series(1,52)",
  [a],
);
await as(a);
await assert.rejects(
  pg.query(
    "insert into attachments(activity_id,name,path,mime,size,id) values($1,'quota.txt',$2,'text/plain',1,$3)",
    [
      activity.id,
      a + "/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ],
  ),
  /Storage quota exceeded/,
);
await pg.exec("rollback");
await as(a);
pass(
  "Permanent tombstones prevent path reuse; deleted/rejected-byte reservations cannot be bypassed by declared size=1",
);
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
  [path, a + "/" + observationFile, a + "/" + noteFile].sort(),
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
// Per-account limits (202611130001). Fresh accounts keep these checks
// independent of the fixtures above.
const limitsA = "33333333-3333-4333-8333-333333333333",
  limitsB = "44444444-4444-4444-8444-444444444444",
  limitsC = "55555555-5555-4555-8555-555555555555";
await pg.exec("reset role");
await pg.query("insert into auth.users values($1),($2),($3)", [
  limitsA,
  limitsB,
  limitsC,
]);
const message = async (sql, args = []) => {
  try {
    await pg.query(sql, args);
  } catch (error) {
    return error.message;
  }
  return "";
};
await as(limitsA);
const limited = (
  await pg.query("insert into workspaces(name) values('Limites') returning *")
).rows[0];
const limitedNote = (
  await pg.query(
    "insert into notes(workspace_id,title) values($1,'Limites') returning *",
    [limited.id],
  )
).rows[0];
const limitedEntry = (
  await pg.query(
    "insert into note_entries(note_id,content) values($1,'x') returning *",
    [limitedNote.id],
  )
).rows[0];
const observed = (
  await pg.query(
    "insert into workspace_observations(workspace_id,content) values($1,'auditada') returning *",
    [limited.id],
  )
).rows[0];
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from audit_logs where entity='workspace_observations' and entity_id=$1",
      [observed.id],
    )
  ).rows[0].n,
  1,
);
// 1201 audited changes inside the last minute: one more than the ceiling.
await pg.exec("reset role");
await pg.query(
  "insert into audit_logs(owner_id,entity,entity_id,action) select $1,'burst',$2,'INSERT' from generate_series(1,1201)",
  [limitsA, limited.id],
);
await as(limitsA);
for (const [sql, args] of [
  ["insert into workspaces(name) values('Excesso')", []],
  ["update workspaces set name='Excesso' where id=$1", [limited.id]],
  [
    "insert into workspace_observations(workspace_id,content) values($1,'x')",
    [limited.id],
  ],
  ["delete from workspace_observations where id=$1", [observed.id]],
  ["select save_entry($1,'y',1)", [limitedEntry.id]],
  ["select delete_note($1)", [limitedNote.id]],
])
  assert.match(await message(sql, args), /Too many requests/, sql);
assert.equal(
  (await pg.query("select name from workspaces where id=$1", [limited.id]))
    .rows[0].name,
  "Limites",
);
// Reads, other accounts and trusted backends are not throttled.
assert.equal((await pg.query("select * from workspaces")).rows.length, 1);
await as(limitsB);
await pg.query("insert into workspaces(name) values('Outra conta')");
await pg.exec("reset role");
await pg.query("select set_config('request.jwt.claim.sub','',false)");
await pg.query("update workspaces set description='backend' where id=$1", [
  limited.id,
]);
// A throttled account can still be deleted by its owner.
await pg.query(
  "insert into audit_logs(owner_id,entity,entity_id,action) select $1,'burst',$2,'INSERT' from generate_series(1,1201)",
  [limitsC, limited.id],
);
await as(limitsC);
await pg.query("select delete_my_account()");
await pg.exec("reset role");
assert.equal(
  (await pg.query("select 1 from auth.users where id=$1", [limitsC])).rows
    .length,
  0,
);
await pg.query("delete from audit_logs where entity='burst'");
await as(limitsA);
await pg.query("update workspaces set name='Liberado' where id=$1", [
  limited.id,
]);
pass(
  "Account write rate: 1201 audited changes in a minute block inserts, updates, deletes and RPCs for that account only; reads, other accounts, backends and account deletion continue",
);
// Row ceiling: also enforced inside a single multi-row statement.
assert.match(
  await message(
    "insert into workspaces(name) select 'w'||g from generate_series(1,250) g",
  ),
  /Account limit reached/,
);
assert.equal((await pg.query("select * from workspaces")).rows.length, 1);
await pg.query(
  "insert into workspaces(name) select 'w'||g from generate_series(1,199) g",
);
assert.match(
  await message("insert into workspaces(name) values('201')"),
  /Account limit reached/,
);
await as(limitsB);
await pg.query("insert into workspaces(name) values('Sem relação')");
await as(limitsA);
await pg.query(
  "select delete_workspace((select id from workspaces where name='w1'))",
);
await pg.query("insert into workspaces(name) values('Vaga liberada')");
pass(
  "Account row ceiling: 200 workspaces per account, enforced within one bulk statement, released by deletion and independent between accounts",
);
// Professional plans (202611140002) share the limits. Work workspaces only.
await as(limitsB);
const career = (
  await pg.query(
    "insert into workspaces(name,category) values('Carreira','work') returning *",
  )
).rows[0];
const targets =
  "insert into career_targets(workspace_id,company,region,country,position) select $1,'Empresa '||g,'brazil','Brasil','Cargo' from generate_series(1,$2::int) g";
assert.match(
  await message(targets, [career.id, 1001]),
  /Account limit reached/,
);
await pg.query(targets, [career.id, 1000]);
assert.match(await message(targets, [career.id, 1]), /Account limit reached/);
await pg.query(
  "insert into professional_development_items(workspace_id,development_area,action_plan) values($1,'Idioma','Aulas')",
  [career.id],
);
await pg.exec("reset role");
await pg.query(
  "insert into audit_logs(owner_id,entity,entity_id,action) select $1,'burst',$2,'INSERT' from generate_series(1,1201)",
  [limitsB, career.id],
);
await as(limitsB);
for (const sql of [
  "update career_targets set notes='x' where workspace_id=$1",
  "insert into professional_development_items(workspace_id,development_area,action_plan) values($1,'a','b')",
  "delete from professional_development_items where workspace_id=$1",
])
  assert.match(await message(sql, [career.id]), /Too many requests/, sql);
await pg.exec("reset role");
await pg.query("delete from audit_logs where entity='burst'");
await as(limitsA);
pass(
  "Professional plans obey the account limits: 1000 career targets per account, exact inside one bulk statement, and the shared write rate",
);

// Operational metrics (202611130002): aggregates for the trusted backend only.
assert.match(await message("select security_metrics()"), /permission denied/);
await pg.exec("reset role; set role anon");
assert.match(await message("select security_metrics()"), /permission denied/);
await pg.exec("reset role; set role service_role");
const metrics = (await pg.query("select security_metrics() m")).rows[0].m;
for (const key of [
  "database_bytes",
  "accounts",
  "uploads_pending",
  "uploads_pending_overdue",
  "oldest_pending_seconds",
  "uploads_clean_24h",
  "uploads_rejected_24h",
  "cleanup_backlog",
  "cleanup_overdue",
  "reserved_bytes",
  "accounts_near_storage_quota",
  "audited_changes_1h",
  "busiest_account_changes_1m",
])
  assert.equal(typeof metrics[key], "number", key);
assert.ok(metrics.accounts >= 3 && metrics.audited_changes_1h > 0);
// Counters only: no identifier or text field can carry private data.
assert.doesNotMatch(
  JSON.stringify(metrics),
  /[0-9a-f]{8}-[0-9a-f]{4}-|@|Limites|Liberado/,
);
pass(
  "Security metrics return aggregate counters to service_role only; clients and anonymous callers are denied",
);

// Privilege snapshot. A new function or table that a client role can reach
// must be added here on purpose; it never happens by default.
await pg.exec("reset role");
const executable = async (role) =>
  (
    await pg.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and has_function_privilege($1,p.oid,'EXECUTE') order by 1`,
      [role],
    )
  ).rows.map((row) => row.proname);
assert.deepEqual(await executable("anon"), []);
assert.deepEqual(await executable("authenticated"), [
  "add_event",
  "delete_entry",
  "delete_my_account",
  "delete_note",
  "delete_observation",
  "delete_workspace",
  "edit_observation",
  "export_professional_plans",
  "observation_counts",
  "save_entry",
  "search_all",
  "set_priority",
  "workspace_timeline",
]);
assert.equal(
  (
    await pg.query(
      `select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and (p.proacl is null or exists(
        select 1 from aclexplode(p.proacl) a where a.grantee=0))`,
    )
  ).rows[0].n,
  0,
  "no function is executable through PUBLIC",
);
// Every SECURITY DEFINER function pins its search_path with pg_temp last.
assert.deepEqual(
  (
    await pg.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prosecdef and not coalesce(
        array_to_string(p.proconfig,',') ~ 'search_path=pg_catalog, ?public, ?pg_temp$',false)`,
    )
  ).rows,
  [],
);
const grants = Object.fromEntries(
  (
    await pg.query(
      `select c.relname, array_remove(array[
        case when has_table_privilege('authenticated',c.oid,'SELECT') then 'SELECT' end,
        case when has_table_privilege('authenticated',c.oid,'INSERT') then 'INSERT' end,
        case when has_table_privilege('authenticated',c.oid,'UPDATE') then 'UPDATE' end,
        case when has_table_privilege('authenticated',c.oid,'DELETE') then 'DELETE' end,
        case when has_table_privilege('authenticated',c.oid,'TRUNCATE') then 'TRUNCATE' end,
        case when has_table_privilege('authenticated',c.oid,'REFERENCES') then 'REFERENCES' end,
        case when has_table_privilege('authenticated',c.oid,'TRIGGER') then 'TRIGGER' end],null) privileges,
        has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
         or has_table_privilege('anon',c.oid,'DELETE,TRUNCATE,TRIGGER') anon,
        c.relrowsecurity rls
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r' order by 1`,
    )
  ).rows.map((row) => {
    assert.equal(row.anon, false, row.relname + " is closed to anon");
    assert.equal(row.rls, true, row.relname + " has row level security");
    return [row.relname, row.privileges.join(",")];
  }),
);
assert.deepEqual(grants, {
  activities: "SELECT,INSERT",
  activity_events: "SELECT",
  attachment_paths: "",
  attachments: "SELECT,DELETE",
  audit_logs: "SELECT",
  career_targets: "SELECT,DELETE",
  note_entries: "SELECT,INSERT",
  notes: "SELECT,INSERT,UPDATE",
  priority_history: "SELECT",
  professional_development_items: "SELECT,DELETE",
  storage_cleanup: "",
  workspace_events: "SELECT",
  workspace_observations: "SELECT,DELETE",
  workspaces: "SELECT,INSERT,UPDATE",
});
pass(
  "Privilege snapshot: anon reaches nothing, authenticated reaches exactly the reviewed tables and 13 RPCs, nothing is granted through PUBLIC, every table has RLS and every definer function pins search_path",
);
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
