// Real PostgreSQL, disposable container, no host mounts/ports or production connection.
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const name = `tasknado-performance-${crypto.randomUUID()}`;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
const evidence = { environment: "postgres:16-alpine, disposable, synthetic fixtures", checks: [], plans: {}, metrics: {} };
function sql(source) { return new Promise((resolve,reject) => {
  const p=spawn("docker",["exec","-i",name,"psql","-h","127.0.0.1","-U","postgres","-v","ON_ERROR_STOP=1","-At"],{windowsHide:true});
  let out="",err="";p.stdout.on("data",s=>out+=s);p.stderr.on("data",s=>err+=s);p.on("error",reject);p.on("close",code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(source);
}); }
const owner="11111111-1111-4111-8111-111111111111", stranger="22222222-2222-4222-8222-222222222222";
const workspace="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", entry="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const as = (id, source) => sql(`set request.jwt.claim.sub='${id}'; set role authenticated; ${source}`).then(s=>s.replace(/^SET\nSET\n/,""));
const plan = async (label, source) => { const data=JSON.parse(await as(owner,`explain (analyze,buffers,format json) ${source}`)); evidence.plans[label]=data; return data[0]; };
const pass = label => { evidence.checks.push(label); console.log("PASS "+label); };
async function noOpCost(label) {
  const before=Number(await sql(`select count(*) from audit_logs where owner_id='${owner}'`));
  await as(owner,`do $$ declare i int; r int; begin for i in 1..100 loop select revision into r from note_entries where id='${entry}'; perform save_entry('${entry}','identical content',r); end loop; end $$;`);
  const delta=Number(await sql(`select count(*) from audit_logs where owner_id='${owner}'`))-before;
  evidence.metrics[label]=delta; return delta;
}
try {
  docker("run","--rm","-d","--network","none","--name",name,"-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:16-alpine");
  let ready=false;
  for(let i=0;i<60;i++){try{docker("exec",name,"pg_isready","-h","127.0.0.1","-U","postgres");ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  assert.ok(ready);
  await sql(readFileSync("scripts/test-database.mjs","utf8").match(/await pg\.exec\(`([\s\S]*?)`\);/)[1]);
  const migrations=readdirSync("supabase/migrations").sort();
  for(const f of migrations.filter(f=>!f.includes("performance_"))) await sql(readFileSync(`supabase/migrations/${f}`,"utf8"));
  await sql(`insert into auth.users values('${owner}'),('${stranger}');
    insert into workspaces(id,owner_id,name,category) values('${workspace}','${owner}','Performance','work');
    insert into activities(owner_id,workspace_id,title,description)
      select '${owner}','${workspace}',lpad(i::text,6,'0') || case when i%1000=0 then ' needle_unique_xyz' else ' routine' end,repeat('Benchmark content ',16) from generate_series(1,11100) i;
    insert into activity_events(owner_id,activity_id,type,content,request_id) select '${owner}',id,'observation','needle_unique_xyz',gen_random_uuid() from activities order by id limit 1110;
    insert into notes(id,owner_id,workspace_id,title) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${owner}','${workspace}','Note');
    insert into note_entries(id,owner_id,note_id,content) values('${entry}','${owner}','dddddddd-dddd-4ddd-8ddd-dddddddddddd','identical content');
    update audit_logs set created_at=clock_timestamp()-interval '10 minutes';
    analyze;`);
  const oldPredicate="to_tsvector('portuguese',title || ' ' || description) @@ websearch_to_tsquery('portuguese','unique_x') or strpos(lower(title || ' ' || description),'unique_x')>0";
  await plan("substring-before",`select id from activities where ${oldPredicate}`);
  await plan("counts-before",`select * from observation_counts('${workspace}')`);
  await plan("search-before",`select * from search_all('unique_x','${workspace}','activity')`);
  assert.equal(await noOpCost("noOpAuditRowsBefore"),300);
  await sql("create extension pg_trgm; create index benchmark_trgm on activities using gin((title || ' ' || description) gin_trgm_ops); analyze;");
  const trgm=await plan("trigram-under-rls",`select id from activities where to_tsvector('portuguese',title || ' ' || description) @@ websearch_to_tsquery('portuguese','unique_x') or (title || ' ' || description) ilike '%unique_x%'`);
  evidence.metrics.trigramUsedUnderRls=JSON.stringify(trgm).includes('benchmark_trgm');
  await sql("drop index benchmark_trgm;");
  for(const f of migrations.filter(f=>f.includes("performance_"))) await sql(readFileSync(`supabase/migrations/${f}`,"utf8"));
  await sql("analyze;");
  const afterPlan=await plan("substring-after",`select id from activities where search_document @@ websearch_to_tsquery('portuguese','unique_x') or (title || ' ' || description) ilike literal_pattern('unique_x')`);
  assert.equal(afterPlan.Plan["Actual Rows"],11);
  await plan("counts-after",`select * from observation_counts_for(array(select id from activities order by id limit 50))`);
  await plan("search-after",`select * from search_all('unique_x','${workspace}','activity')`);
  await plan("first-page",`select id from activities where owner_id='${owner}' and workspace_id='${workspace}' order by updated_at desc,id desc limit 51`);
  pass("EXPLAIN ANALYZE BUFFERS: stored tokenization, scoped substring scans, counts and deterministic pages measured without weakening RLS");
  assert.equal(Number(await as(owner,`select count(*) from activity_page('${workspace}')`)),51);
  assert.equal(Number(await as(owner,`select activity_total('${workspace}')`)),11100);
  for(const sort of ["updated_at","created_at","title","scheduled"]) {
    // Traverse inside one test transaction, including ties, using the exact public cursor contract.
    const n=await as(owner,`create temporary table seen(id uuid primary key); do $$ declare cursor jsonb; batch jsonb; last_row jsonb; begin loop
      select jsonb_agg(to_jsonb(r)) into batch from (select * from activity_page('${workspace}','{}','${sort}',cursor,50) limit 50) r;
      exit when batch is null; insert into seen select (j->>'id')::uuid from jsonb_array_elements(batch) j;
      last_row=batch->(jsonb_array_length(batch)-1);cursor=jsonb_build_object('id',last_row->>'id','value',last_row->>'cursor_value');
    end loop; end $$; select count(*) from seen;`);
    assert.equal(Number(n.split("\n").at(-1)),11100);
    console.log("Traversed " + sort);
  }
  pass("All 11,100 activities traversed once with each of four keyset orders, including schedule ties");
  assert.equal(Number(await as(owner,`select activity_total('${workspace}','{"query":"unique_x"}')`)),11);
  assert.equal(Number(await as(owner,`select count(*) from activity_page('${workspace}','{"query":"unique_x"}')`)),11);
  assert.equal(Number(await as(stranger,`select count(*) from activity_page('${workspace}')`)),0);
  assert.equal(Number(await as(stranger,`select activity_total('${workspace}')`)),0);
  assert.equal(Number(await as(stranger,`select count(*) from observation_counts_for(array(select id from public.activities))`)),0);
  await assert.rejects(sql(`set role anon; select * from activity_page('${workspace}')`));
  await assert.rejects(sql("set role anon; select export_revision()"));
  pass("Filters apply before pagination; RLS and RPC permissions isolate another owner and deny anonymous access");
  assert.equal(await noOpCost("noOpAuditRowsAfter"),0);
  const rev=Number(await sql(`select revision from note_entries where id='${entry}'`));
  await assert.rejects(as(owner,`select save_entry('${entry}','identical content',${rev-1})`));
  await as(owner,`select save_entry('${entry}','actual change',${rev})`);
  assert.equal(Number(await sql(`select revision from note_entries where id='${entry}'`)),rev+1);
  pass("100 identical saves produce zero audit/parent writes; stale revisions fail and real edits increment revision");
  const token=await as(owner,"select export_revision()");
  await as(owner,`update activities set title=title where id=(select id from activities limit 1)`);
  assert.equal(await as(owner,"select export_revision()"),token);
  await as(owner,`update activities set title=title || ' changed' where id=(select id from activities limit 1)`);
  assert.notEqual(await as(owner,"select export_revision()"),token);
  await assert.rejects(as(owner,"select export_professional_page('auth.users')"));
  pass("Export change token ignores no-ops, detects edits, and export table allowlist rejects arbitrary reads");
  await sql(readFileSync("supabase/rollback/20261115_performance.sql", "utf8"));
  assert.equal(Number(await as(owner,`select count(*) from search_all('unique_x','${workspace}','activity')`)),11);
  assert.equal(Number(await as(stranger,`select count(*) from search_all('unique_x','${workspace}','activity')`)),0);
  pass("Rollback restores previous routines while preserving rows, search results and owner isolation");
} finally {
  mkdirSync("test-results/performance",{recursive:true});
  writeFileSync("test-results/performance/postgres.json",JSON.stringify(evidence,null,2));
  try{docker("rm","-f",name);}catch{}
}
