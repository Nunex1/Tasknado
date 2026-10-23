import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL,
  key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.match(
  url,
  /^http:\/\/(127\.0\.0\.1|localhost):55431$/,
  "Integration tests must use isolated local Tasknado",
);
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(
  adminKey,
  "Provide local service role key through the environment only",
);
const admin = createClient(url, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const makeClient = () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const ok = (r) => {
  assert.ifError(r.error);
  return r.data;
};
const evidence = [];
const pass = (s) => {
  evidence.push(s);
  console.log("PASS " + s);
};
const created = [];
let workspace;
try {
  const stamp = Date.now(),
    password = "Tasknado-Test!" + stamp;
  const accounts = [];
  for (const label of ["a", "b"]) {
    const email = `integration-${label}-${stamp}@tasknado.test`;
    const u = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    ).user;
    created.push(u.id);
    const c = makeClient();
    ok(await c.auth.signInWithPassword({ email, password }));
    accounts.push({ c, u, email });
  }
  const [{ c: a, u: ua, email }, { c: b, u: ub }] = accounts;
  pass("Two real accounts authenticate");
  workspace = ok(
    await a
      .from("workspaces")
      .insert({
        name: "Controladoria integração",
        description: "Rateio armazenagem",
      })
      .select()
      .single(),
  );
  const activity = ok(
    await a
      .from("activities")
      .insert({
        workspace_id: workspace.id,
        title: "Rateio armazenagem",
        description: "Conferência de despesas",
        status: "completed",
      })
      .select()
      .single(),
  );
  assert.equal(activity.status, "not_started");
  pass("Server enforces initial state");
  assert.equal(
    ok(await b.from("workspaces").select("*").eq("id", workspace.id)).length,
    0,
  );
  assert.equal(
    ok(await b.from("activities").select("*").eq("id", activity.id)).length,
    0,
  );
  assert.ok(
    (
      await b
        .from("activities")
        .insert({ workspace_id: workspace.id, title: "intrusão" })
    ).error,
  );
  assert.ok(
    (
      await a.from("activities").insert({
        owner_id: ub.id,
        workspace_id: workspace.id,
        title: "intrusão",
      })
    ).error,
  );
  assert.ok(
    (
      await a
        .from("activities")
        .update({ status: "completed" })
        .eq("id", activity.id)
    ).error,
  );
  pass("RLS blocks cross-account reads, forged ownership and status bypass");
  const req = crypto.randomUUID();
  const event = (type, content, request = crypto.randomUUID(), c = a) =>
    c.rpc("add_event", {
      p_activity: activity.id,
      p_type: type,
      p_content: content,
      p_request: request,
    });
  assert.ok((await event("resume", "Inválido")).error);
  const [first, duplicate] = await Promise.all([
    event("check_in", "Início da verificação", req),
    event("check_in", "Início da verificação", req),
  ]);
  assert.equal(ok(first).id, ok(duplicate).id);
  assert.ok((await event("pause", "Outro conteúdo", req)).error);
  assert.ok((await event("pause", "Tentativa", crypto.randomUUID(), b)).error);
  ok(await event("pause", "Divergência nas despesas"));
  ok(await event("resume", "Conferência concluída"));
  ok(await event("observation", "Origem da divergência localizada"));
  ok(await event("check_out", "Rateio finalizado"));
  const events = ok(
    await a
      .from("activity_events")
      .select("*")
      .eq("activity_id", activity.id)
      .order("created_at"),
  );
  assert.equal(events.length, 5);
  assert.deepEqual(
    events.map((e) => e.type),
    ["check_in", "pause", "resume", "observation", "check_out"],
  );
  assert.ok(
    (
      await a
        .from("activity_events")
        .update({ content: "Alteração" })
        .eq("id", events[0].id)
    ).error,
  );
  assert.ok(
    (
      await a.from("activity_events").insert({
        activity_id: activity.id,
        type: "observation",
        content: "Bypass",
        request_id: crypto.randomUUID(),
      })
    ).error,
  );
  pass("Atomic lifecycle, chronology, idempotency and immutable events");
  ok(await a.auth.signOut());
  ok(await a.auth.signInWithPassword({ email, password }));
  assert.equal(
    ok(
      await a
        .from("activity_events")
        .select("*")
        .eq("activity_id", activity.id),
    ).length,
    5,
  );
  pass("History persists after logout and login");

  for (const category of [
    "personal_life",
    "university",
    "work",
    "self_study",
    "sports",
  ]) {
    const w = ok(
      await a
        .from("workspaces")
        .insert({ name: "Category integration " + category, category })
        .select()
        .single(),
    );
    if (category === "university")
      assert.ok(
        (
          await a
            .from("activities")
            .insert({ workspace_id: w.id, title: "Missing Canvas" })
        ).error,
      );
    const attrs =
      category === "university"
        ? { university: { openedInCanvas: false } }
        : {};
    const task = ok(
      await a
        .from("activities")
        .insert({
          workspace_id: w.id,
          title: "Category task",
          category_attributes: attrs,
        })
        .select()
        .single(),
    );
    const observation = ok(
      await a.rpc("add_event", {
        p_activity: task.id,
        p_type: "observation",
        p_content: "Original observation",
        p_request: crypto.randomUUID(),
      }),
    );
    ok(
      await a.rpc("edit_observation", {
        p_id: observation.id,
        p_content: "Edited observation",
        p_expected: observation.content,
      }),
    );
    assert.ok(
      (
        await b.rpc("delete_observation", {
          p_id: observation.id,
          p_expected: "Edited observation",
        })
      ).error,
    );
    const saved = ok(
      await a
        .from("activity_events")
        .select("*")
        .eq("id", observation.id)
        .single(),
    );
    assert.equal(saved.created_at, observation.created_at);
    assert.ok(saved.edited_at);
    if (category === "work") {
      const work = {
        hasScheduledDate: true,
        scheduledDate: "2026-10-30",
        scheduledTime: "14:00",
        isUrgent: null,
        isImportant: null,
      };
      ok(
        await a
          .from("activities")
          .update({ category_attributes: { work } })
          .eq("id", task.id),
      );
      for (const [urgent, important] of [
        [true, true],
        [false, true],
        [true, false],
        [false, false],
        [null, null],
      ])
        ok(
          await a.rpc("set_priority", {
            p_activity: task.id,
            p_urgent: urgent,
            p_important: important,
          }),
        );
      const history = ok(
        await a.from("priority_history").select("*").eq("activity_id", task.id),
      );
      assert.equal(history.length, 5);
      assert.equal(
        ok(
          await b
            .from("priority_history")
            .select("*")
            .eq("activity_id", task.id),
        ).length,
        0,
      );
      const savedTask = ok(
        await a.from("activities").select("*").eq("id", task.id).single(),
      );
      assert.equal(
        savedTask.category_attributes.work.scheduledDate,
        work.scheduledDate,
      );
      assert.equal(savedTask.status, "not_started");
      ok(
        await a
          .from("workspaces")
          .update({ category: "sports" })
          .eq("id", w.id),
      );
      assert.ok(
        (
          await a.rpc("set_priority", {
            p_activity: task.id,
            p_urgent: true,
            p_important: true,
          })
        ).error,
      );
      ok(
        await a.from("workspaces").update({ category: "work" }).eq("id", w.id),
      );
      assert.deepEqual(
        ok(await a.from("activities").select("*").eq("id", task.id).single())
          .category_attributes,
        savedTask.category_attributes,
      );
    }
    const reopened = makeClient();
    ok(await reopened.auth.signInWithPassword({ email, password }));
    assert.equal(
      ok(
        await reopened
          .from("activity_events")
          .select("*")
          .eq("id", observation.id)
          .single(),
      ).content,
      "Edited observation",
    );
    ok(await reopened.auth.signOut({ scope: "local" }));
    ok(
      await a.rpc("delete_observation", {
        p_id: observation.id,
        p_expected: "Edited observation",
      }),
    );
    assert.equal(
      ok(await a.from("activity_events").select("*").eq("id", observation.id))
        .length,
      0,
    );
    ok(await a.rpc("delete_workspace", { p_workspace: w.id }));
  }
  pass(
    "All five categories persist editable observations across sessions; Canvas validation, scheduling, all quadrants, priority history and category changes work through real authenticated APIs",
  );
  const note = ok(
    await a
      .from("notes")
      .insert({
        workspace_id: workspace.id,
        title: "Procedimentos de armazenagem",
      })
      .select()
      .single(),
  );
  const entry = ok(
    await a
      .from("note_entries")
      .insert({ note_id: note.id, content: "Primeiro registro" })
      .select()
      .single(),
  );
  const saves = await Promise.all([
    a.rpc("save_entry", {
      p_id: entry.id,
      p_content: "Procedimento revisado",
      p_revision: 1,
    }),
    a.rpc("save_entry", {
      p_id: entry.id,
      p_content: "Outra versão",
      p_revision: 1,
    }),
  ]);
  assert.equal(saves.filter((s) => !s.error).length, 1);
  assert.equal(saves.filter((s) => s.error).length, 1);
  assert.ok(
    (
      await b.rpc("save_entry", {
        p_id: entry.id,
        p_content: "Intrusão",
        p_revision: 2,
      })
    ).error,
  );
  pass("Autosave persists and rejects stale concurrent writes");
  const fid = crypto.randomUUID(),
    path = `${ua.id}/${fid}`,
    file = new Blob(["Evidência do rateio"], { type: "text/plain" });
  ok(
    await a.from("attachments").insert({
      id: fid,
      activity_id: activity.id,
      path,
      name: "rateio-evidencia.txt",
      mime: "text/plain",
      size: file.size,
    }),
  );
  ok(
    await a.storage
      .from("attachments")
      .upload(path, file, { contentType: "text/plain" }),
  );
  const downloaded = ok(await a.storage.from("attachments").download(path));
  assert.equal(await downloaded.text(), "Evidência do rateio");
  assert.ok((await b.storage.from("attachments").download(path)).error);
  assert.ok(
    (await b.storage.from("attachments").createSignedUrl(path, 60)).error,
  );
  assert.ok(
    (
      await a.storage
        .from("attachments")
        .upload(`${ua.id}/${crypto.randomUUID()}`, file)
    ).error,
  );
  pass(
    "Private Storage roundtrip preserves bytes and blocks unauthorized access",
  );
  const results = ok(await a.rpc("search_all", { p_query: "rateio" }));
  assert.ok(results.some((r) => r.kind === "activity"));
  assert.ok(results.some((r) => r.kind === "file"));
  assert.equal(ok(await b.rpc("search_all", { p_query: "rateio" })).length, 0);
  assert.ok(
    ok(
      await a.rpc("search_all", {
        p_query: "rateio",
        p_kind: "activity",
        p_status: "completed",
        p_workspace: workspace.id,
      }),
    ).every((r) => r.kind === "activity" && r.status === "completed"),
  );
  pass(
    "Portuguese FTS includes files and activities with private filtered results",
  );
  const observation = ok(
    await a
      .from("workspace_observations")
      .insert({
        workspace_id: workspace.id,
        content: "Registro geral de oceanografia",
      })
      .select()
      .single(),
  );
  assert.equal(observation.created_at, observation.updated_at);
  const edited = ok(
    await a
      .from("workspace_observations")
      .update({ content: "Registro geral de oceanografia revisado" })
      .eq("id", observation.id)
      .eq("updated_at", observation.updated_at)
      .select()
      .single(),
  );
  assert.equal(edited.created_at, observation.created_at);
  assert.notEqual(edited.updated_at, edited.created_at);
  assert.equal(
    ok(
      await a
        .from("workspace_observations")
        .update({ content: "Sobrescrita antiga" })
        .eq("id", observation.id)
        .eq("updated_at", observation.updated_at)
        .select(),
    ).length,
    0,
  );
  assert.equal(
    ok(await b.from("workspace_observations").select("*")).length,
    0,
  );
  assert.ok(
    (
      await b
        .from("workspace_observations")
        .insert({ workspace_id: workspace.id, content: "Intrusão" })
    ).error,
  );
  assert.equal(
    ok(
      await b
        .from("workspace_observations")
        .update({ content: "Intrusão" })
        .eq("id", observation.id)
        .select(),
    ).length,
    0,
  );
  assert.equal(
    ok(
      await b
        .from("workspace_observations")
        .delete()
        .eq("id", observation.id)
        .select(),
    ).length,
    0,
  );
  assert.ok(
    ok(await a.rpc("search_all", { p_query: "oceanog" })).some(
      (r) => r.id === observation.id && r.kind === "workspace_observation",
    ),
  );
  assert.equal(ok(await b.rpc("search_all", { p_query: "oceanog" })).length, 0);
  ok(
    await a.auth.updateUser({
      data: {
        full_name: "Érica Silva",
        nickname: "Mar",
        avatar_initial: "Á",
        avatar_color: "#b8e0ff",
        preferred_language: "en-US",
      },
    }),
  );
  ok(await a.auth.signOut());
  const logged = ok(await a.auth.signInWithPassword({ email, password }));
  assert.equal(logged.user.user_metadata.nickname, "Mar");
  assert.equal(logged.user.user_metadata.avatar_initial, "Á");
  assert.equal(logged.user.user_metadata.avatar_color, "#b8e0ff");
  assert.equal(logged.user.user_metadata.preferred_language, "en-US");
  assert.equal(
    ok(
      await a
        .from("workspace_observations")
        .select("*")
        .eq("id", observation.id)
        .single(),
    ).content,
    edited.content,
  );
  pass(
    "Workspace observation CRUD timestamps, stale-edit detection, substring search and two-user isolation; profile and preferred language persist through a new auth session",
  );
  const history = ok(
    await a.rpc("workspace_timeline", { p_workspace: workspace.id }),
  );
  assert.ok(history.some((r) => r.action === "activity_created"));
  assert.ok(history.some((r) => r.action === "status_changed"));
  assert.ok(
    history.some(
      (r) =>
        r.action === "observation_created" &&
        r.current?.content === observation.content,
    ),
  );
  assert.ok(
    history.some(
      (r) =>
        r.action === "observation_edited" &&
        r.previous?.content === observation.content &&
        r.current?.content === edited.content,
    ),
  );
  assert.equal(
    ok(await b.rpc("workspace_timeline", { p_workspace: workspace.id })).length,
    0,
  );
  assert.ok(
    (
      await a
        .from("workspace_events")
        .insert({
          workspace_id: workspace.id,
          owner_id: ua.id,
          source_id: observation.id,
          action: "forged",
        })
    ).error,
  );
  assert.ok(
    (
      await a
        .from("workspace_events")
        .update({ action: "forged" })
        .eq("workspace_id", workspace.id)
    ).error,
  );
  ok(await a.from("workspace_observations").delete().eq("id", observation.id));
  assert.ok(
    ok(await a.rpc("workspace_timeline", { p_workspace: workspace.id })).some(
      (r) =>
        r.action === "observation_deleted" &&
        r.previous?.content === edited.content,
    ),
  );
  assert.equal(ok(await a.rpc("search_all", { p_query: "oceanog" })).length, 0);
  pass(
    "Operational history contains real creation/status/observation snapshots, survives deletion and rejects direct writes and other owners",
  );
  assert.ok(ok(await a.from("audit_logs").select("*")).length > 0);
  assert.equal(ok(await b.from("audit_logs").select("*")).length, 0);
  pass("Audit logs are populated and isolated");
  ok(
    await a.from("activities").update({ archived: true }).eq("id", activity.id),
  );
  assert.ok((await event("observation", "Arquivada")).error);
  assert.equal(
    ok(
      await a
        .from("activity_events")
        .select("*")
        .eq("activity_id", activity.id),
    ).length,
    5,
  );
  pass("Archiving retains history");
  ok(await a.storage.from("attachments").remove([path]));
  ok(await a.rpc("delete_workspace", { p_workspace: workspace.id }));
  assert.equal(
    ok(await a.from("activities").select("*").eq("id", activity.id)).length,
    0,
  );
  assert.equal(
    ok(await a.from("note_entries").select("*").eq("id", entry.id)).length,
    0,
  );
  pass("Workspace deletion cascades only its records");
  const anon = makeClient();
  assert.ok((await anon.rpc("search_all", { p_query: "rateio" })).error);
  pass("Unauthenticated search rejected");
} finally {
  for (const id of created) {
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) console.error("Cleanup failed: " + result.error.message);
  }
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/integration.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        passed: evidence.length,
        checks: evidence,
      },
      null,
      2,
    ),
  );
}
