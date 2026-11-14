// Real embedded PostgreSQL, all migrations, Supabase Auth/Storage schema harness.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const checks = [];
const pass = (label) => {
  checks.push(label);
  console.log("PASS " + label);
};
const harness = readFileSync("scripts/test-database.mjs", "utf8").match(
  /await pg\.exec\(`([\s\S]*?)`\);/,
)[1];
await pg.exec(harness);
for (const file of readdirSync("supabase/migrations").sort())
  await pg.exec(
    readFileSync("supabase/migrations/" + file, "utf8").replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
const a = crypto.randomUUID(),
  b = crypto.randomUUID();
await pg.query("insert into auth.users values($1),($2)", [a, b]);
const as = async (id) => {
  await pg.exec("reset role");
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await pg.exec("set role authenticated");
};
const one = async (sql, args = []) => (await pg.query(sql, args)).rows[0];
const count = async (table, args = []) =>
  (await one(`select count(*)::int as count from ${table}`, args)).count;
const fails = async (sql, args = []) => {
  await assert.rejects(pg.query(sql, args));
};
try {
  await as(a);
  const w = await one(
    "insert into workspaces(name,category) values('Work','work') returning *",
  );
  const other = await one(
    "insert into workspaces(name,category) values('Other','work') returning *",
  );
  const requirements = "  Degree\n\n• English\nTypeScript  ";
  const target = await one(
    "insert into career_targets(workspace_id,company,country,position,region,market_requirements) values($1,'Company','Custom country','Engineer','abroad',$2) returning *",
    [w.id, requirements],
  );
  await one(
    "insert into career_targets(workspace_id,company,country,position,region) values($1,'Brazilian company','Brasil','Engineer','brazil') returning *",
    [w.id],
  );
  const pdi = await one(
    "insert into professional_development_items(workspace_id,development_area,action_plan,career_target_id) values($1,'English','Practice\nweekly',$2) returning *",
    [w.id, target.id],
  );
  assert.equal(pdi.revision, 1);
  assert.equal(target.market_requirements, requirements);
  await fails(
    "insert into professional_development_items(workspace_id,development_area,action_plan) values($1,'Area','  ')",
    [w.id],
  );
  await fails(
    "insert into professional_development_items(workspace_id,development_area,action_plan,start_date,due_date) values($1,'Area','Plan','2026-11-13','2026-11-12')",
    [w.id],
  );
  await fails(
    "update career_targets set opportunity_url='javascript:alert(1)' where id=$1",
    [target.id],
  );
  await fails("update career_targets set priority=4 where id=$1", [target.id]);
  await fails(
    "update professional_development_items set status='paused' where id=$1",
    [pdi.id],
  );
  pass(
    "Required pairs, optional fields, custom countries, exact whitespace, status/date/priority/URL constraints",
  );
  for (const table of ["career_targets", "professional_development_items"]) {
    await fails(`update ${table} set owner_id=$1`, [b]);
    await fails(`update ${table} set workspace_id=$1`, [other.id]);
    await fails(`update ${table} set created_at=now(),revision=100`);
    await fails(`truncate ${table} cascade`);
    await fails(`insert into ${table}(owner_id,workspace_id) values($1,$2)`, [
      b,
      w.id,
    ]);
  }
  await fails(
    "insert into professional_development_items(workspace_id,development_area,action_plan,career_target_id) values($1,'Area','Plan',$2)",
    [other.id, target.id],
  );
  pass(
    "Column grants protect identity, chronology, revision and TRUNCATE; composite links reject another workspace",
  );
  const updated = await one(
    "update professional_development_items set action_plan='New plan',status='in_progress' where id=$1 and revision=1 returning *",
    [pdi.id],
  );
  assert.equal(updated.revision, 2);
  assert.equal(+updated.created_at, +pdi.created_at);
  assert.ok(+updated.updated_at >= +pdi.updated_at);
  assert.equal(
    (
      await pg.query(
        "update professional_development_items set action_plan='Stale' where id=$1 and revision=1 returning *",
        [pdi.id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await pg.query(
        "delete from professional_development_items where id=$1 and revision=1 returning *",
        [pdi.id],
      )
    ).rows.length,
    0,
  );
  await pg.query(
    "update career_targets set sort_order=10,market_requirements=$2 where id=$1 and revision=1",
    [target.id, requirements + "\nEdited"],
  );
  pass(
    "CRUD updates preserve creation time; revisions reject stale edits and deletes; manual order persists",
  );
  await as(b);
  for (const table of ["career_targets", "professional_development_items"]) {
    assert.equal(await count(table), 0);
    assert.equal(
      (await pg.query(`delete from ${table} returning id`)).rows.length,
      0,
    );
    assert.deepEqual(
      (await one("select export_professional_plans($1) as data", [table])).data,
      [],
    );
  }
  await fails(
    "insert into career_targets(workspace_id,company,country,position,region) values($1,'Intruder','Brasil','Engineer','brazil')",
    [w.id],
  );
  const strangerWorkspace = await one(
    "insert into workspaces(name,category) values('Stranger','work') returning *",
  );
  await fails(
    "insert into professional_development_items(workspace_id,development_area,action_plan,career_target_id) values($1,'Area','Plan',$2)",
    [strangerWorkspace.id, target.id],
  );
  assert.equal(
    (
      await pg.query(
        "update career_targets set company='Intruder' where id=$1 returning id",
        [target.id],
      )
    ).rows.length,
    0,
  );
  pass(
    "A second authenticated user cannot read, export, modify, delete, insert into, or link the owner's records",
  );
  await as(a);
  await pg.query("update workspaces set category='personal_life' where id=$1", [
    w.id,
  ]);
  for (const table of ["career_targets", "professional_development_items"]) {
    assert.equal(await count(table), 0);
    assert.equal(
      (await pg.query(`delete from ${table} returning id`)).rows.length,
      0,
    );
    assert.ok(
      (await one("select export_professional_plans($1) as data", [table])).data
        .length > 0,
    );
  }
  await fails(
    "insert into professional_development_items(workspace_id,development_area,action_plan) values($1,'Area','Plan')",
    [w.id],
  );
  assert.equal(
    (
      await pg.query(
        "update career_targets set company='Blocked' where id=$1 returning id",
        [target.id],
      )
    ).rows.length,
    0,
  );
  await fails("select export_professional_plans('auth.users')");
  await fails("select export_professional_plans('career_targets',-1)");
  await pg.query("update workspaces set category='work' where id=$1", [w.id]);
  assert.equal(await count("career_targets"), 2);
  assert.equal(await count("professional_development_items"), 1);
  assert.equal(
    (
      await one(
        "select action_plan from professional_development_items where id=$1",
        [pdi.id],
      )
    ).action_plan,
    "New plan",
  );
  pass(
    "Category changes hide and deny writes without deleting data; owner-only export retains inactive records; Work restores visibility",
  );
  await pg.query("delete from career_targets where id=$1", [target.id]);
  const detached = await one(
    "select * from professional_development_items where id=$1",
    [pdi.id],
  );
  assert.equal(detached.career_target_id, null);
  assert.equal(detached.revision, 3);
  assert.equal(detached.development_area, "English");
  await pg.query(
    "delete from professional_development_items where id=$1 and revision=$2",
    [pdi.id, detached.revision],
  );
  assert.equal(await count("professional_development_items"), 0);
  pass(
    "Deleting a target unlinks and preserves the PDI; explicit PDI deletion removes both associated texts",
  );
  await pg.query(
    "insert into professional_development_items(workspace_id,development_area,action_plan) values($1,'Area','Plan')",
    [w.id],
  );
  await pg.query("update workspaces set category='sports' where id=$1", [w.id]);
  await pg.query("select delete_workspace($1)", [w.id]);
  await pg.exec("reset role");
  assert.equal(await count("career_targets"), 0);
  assert.equal(await count("professional_development_items"), 0);
  pass(
    "Existing workspace deletion cascades both modules even while category is incompatible",
  );
  await as(a);
  await pg.query(
    "insert into professional_development_items(workspace_id,development_area,action_plan) select $1,'Area '||n,'Plan '||n from generate_series(1,501) n",
    [other.id],
  );
  const firstPage = (
    await one(
      "select export_professional_plans('professional_development_items',0) as data",
    )
  ).data;
  const secondPage = (
    await one(
      "select export_professional_plans('professional_development_items',500) as data",
    )
  ).data;
  assert.equal(firstPage.length, 500);
  assert.equal(secondPage.length, 1);
  assert.equal(
    new Set([...firstPage, ...secondPage].map((row) => row.id)).size,
    501,
  );
  pass(
    "Export pagination includes all 501 records once in bounded 500-row pages",
  );
  await pg.query(
    "insert into career_targets(workspace_id,company,country,position,region) values($1,'Company','Brasil','Engineer','brazil')",
    [other.id],
  );
  await pg.query("select delete_my_account()");
  await pg.exec("reset role");
  assert.equal(await count("career_targets"), 0);
  assert.equal(await count("professional_development_items"), 0);
  await pg.query("select set_config('request.jwt.claim.sub','',false)");
  await pg.exec("set role anon");
  for (const table of ["career_targets", "professional_development_items"])
    await fails(`select * from ${table}`);
  await fails("select export_professional_plans('career_targets')");
  await pg.exec("reset role; set role authenticated");
  await fails("select export_professional_plans('career_targets')");
  pass(
    "Account deletion cascades new tables and audit rows; anonymous/session-less access is denied",
  );
} finally {
  await pg.close();
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/professional-database.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        scope:
          "All migrations in real embedded PostgreSQL with Supabase schema harness",
      },
      null,
      2,
    ),
  );
}
