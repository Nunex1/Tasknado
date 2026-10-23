"use client";
import { useI18n } from "@/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  Search,
  Settings,
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  Briefcase,
  BookOpen,
  Wallet,
  Code2,
  ArrowUpRight,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  LockKeyhole,
  LogOut,
  Menu,
  X,
  Archive,
  Download,
  Trash2,
} from "lucide-react";
import { db, client, check, errorMessage } from "@/lib/supabase";
import {
  Workspace,
  WorkspaceCategory,
  workspaceCategories,
  isOverdue,
  Activity,
  Note,
  SearchResult,
  Status,
  statuses,
} from "@/lib/domain";
import { Auth } from "./auth";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { ActivityDetail } from "./activity-detail";
import { Notes } from "./notes";
import { GlobalSearch } from "./search";
import { BrandLogo } from "./brand";
import { Profile } from "./profile";
import { LanguageSettings } from "./language-settings";
import {
  CategoryFields,
  attributesFromForm,
  Schedule,
} from "./category-fields";
import { PriorityMatrix } from "./priority-matrix";
import { routeState, workspacePath, View } from "@/lib/navigation";
import { DesktopShell, workspaceTabs } from "./desktop-shell";
import { WorkspaceObservations, WorkspaceHistory } from "./workspace-records";
import { WorkspaceDirectory, RecentObservations } from "./workspace-overview";
import { quadrant, quadrants, isStarted } from "@/lib/domain";
import { fetchPages } from "@/lib/pagination";
type Editor =
  | { kind: "workspace"; item?: Workspace }
  | { kind: "activity"; item?: Activity }
  | { kind: "note"; item?: Note };
const icons: Record<string, typeof Folder> = {
  folder: Folder,
  briefcase: Briefcase,
  book: BookOpen,
  wallet: Wallet,
  code: Code2,
};
export function App() {
  const { t, date, number, locale, setAccount } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isProfile = pathname === "/perfil";
  const { workspaceId, view, activityId, noteId } = routeState(pathname);
  const focusId = useSearchParams().get("focus");
  const [editorWorkspaceId, setEditorWorkspaceId] = useState("");
  const [observationCounts, setObservationCounts] = useState<
    Record<string, number>
  >({});
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [recovery, setRecovery] = useState(false),
    [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [activities, setActivities] = useState<Activity[]>([]),
    [notes, setNotes] = useState<Note[]>([]),
    [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [toast, setToast] = useState(""),
    [archived, setArchived] = useState(false),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("updated_at"),
    [limit, setLimit] = useState(50),
    [hasMore, setHasMore] = useState(false),
    [noteMore, setNoteMore] = useState(false);
  const [canvasFilter, setCanvasFilter] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dirty = useRef(new Set<string>());
  useEffect(() => {
    if (ready)
      setAccount(user?.id ?? null, user?.user_metadata?.preferred_language);
  }, [ready, user?.id, user?.user_metadata?.preferred_language, setAccount]);
  const loadSeq = useRef(0);
  const report = useCallback((s: string) => setToast(s), []);
  const onDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id);
    else dirty.current.delete(id);
  }, []);
  function canLeave() {
    if (!dirty.current.size) return true;
    report("Há alterações não salvas. Salve ou cancele antes de sair.");
    return false;
  }
  const workspace = workspaces.find((w) => w.id === workspaceId),
    selected = activities.find((a) => a.id === activityId);
  async function loadWorkspaces() {
    setWorkspaces(await allWorkspaces());
  }
  function allWorkspaces() {
    return fetchPages((from, to) =>
      client()
        .from("workspaces")
        .select("*")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
  }
  async function allActivities(id: string | null) {
    const data = await fetchPages((from, to) => {
      let q = client()
        .from("activities")
        .select("*")
        .order("id")
        .range(from, to);
      if (id) q = q.eq("workspace_id", id);
      return q;
    });
    return { data, error: null };
  }
  async function loadContent() {
    if (!user) {
      setActivities([]);
      setNotes([]);
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError("");
    try {
      const notesQuery = fetchPages((from, to) => {
        let q = client()
          .from("notes")
          .select("*")
          .order("updated_at", { ascending: false })
          .order("id")
          .range(from, to);
        if (workspaceId) q = q.eq("workspace_id", workspaceId);
        return q;
      }, limit);
      const [a, n, counts, spaces] = await Promise.all([
        allActivities(workspaceId),
        notesQuery,
        fetchPages((from, to) =>
          client()
            .rpc("observation_counts", { p_workspace: workspaceId })
            .order("activity_id")
            .range(from, to),
        ),
        allWorkspaces(),
      ]);
      const aa = check(a) as Activity[],
        nn = n as Note[];
      if (activityId && !aa.some((item) => item.id === activityId)) {
        const row = check(
          await client()
            .from("activities")
            .select("*")
            .eq("id", activityId)
            .eq("workspace_id", workspaceId!)
            .maybeSingle(),
        );
        if (row) aa.push(row as Activity);
      }
      if (noteId && !nn.some((item) => item.id === noteId)) {
        const row = check(
          await client()
            .from("notes")
            .select("*")
            .eq("id", noteId)
            .eq("workspace_id", workspaceId!)
            .maybeSingle(),
        );
        if (row) nn.push(row as Note);
      }
      if (seq === loadSeq.current) {
        setWorkspaces(spaces);
        setObservationCounts(
          Object.fromEntries(counts.map((r) => [r.activity_id, r.total])),
        );
        setActivities(aa);
        setNotes(nn);
        setHasMore(false);
        setNoteMore(nn.length === limit);
      }
    } catch (e) {
      if (seq === loadSeq.current) setLoadError(errorMessage(e));
      throw e;
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!db) {
      setReady(true);
      return;
    }
    const { data } = db.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (!session) {
        setWorkspaces([]);
        setActivities([]);
        setNotes([]);
        dirty.current.clear();
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user) void loadWorkspaces().catch((e) => report(errorMessage(e)));
  }, [user?.id]);
  useEffect(() => {
    void loadContent().catch((e) => report(errorMessage(e)));
  }, [user?.id, workspaceId, limit, activityId, noteId, view]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 8000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("beforeunload", unload);
    };
  }, [pathname, router]);
  function go(path: string) {
    if (canLeave()) router.push(path);
  }
  function navigate(next: View) {
    go(
      workspaceId
        ? workspacePath(workspaceId, next)
        : next === "dashboard"
          ? "/"
          : "/" + next,
    );
  }
  const setView = navigate;
  function setActivityId(id: string | null) {
    const a = activities.find((a) => a.id === id);
    go(
      id
        ? workspacePath(a?.workspace_id || workspaceId!, "activities", id)
        : workspaceId
          ? workspacePath(workspaceId, "activities")
          : "/activities",
    );
  }
  function setNoteId(id: string | null) {
    const n = notes.find((n) => n.id === id);
    go(
      id
        ? workspacePath(n?.workspace_id || workspaceId!, "notes", id)
        : workspaceId
          ? workspacePath(workspaceId, "notes")
          : "/notes",
    );
  }
  function switchWorkspace(id: string) {
    go(workspacePath(id));
  }
  useEffect(() => {
    setLimit(50);
    setFilter("");
    setQuery("");
    setArchived(false);
    setCanvasFilter("");
    setScheduleFilter("");
    setDateFrom("");
    setDateTo("");
    setSort("updated_at");
  }, [workspaceId]);
  const editorWorkspace =
    workspace ||
    workspaces.find((w) => w.id === editorWorkspaceId) ||
    workspaces.find((w) => !w.archived);
  async function save(form: FormData) {
    if (!editor) return;
    setBusy(true);
    try {
      const title = String(form.get("title")).trim(),
        description = String(form.get("description") || "");
      if (editor.kind === "workspace") {
        const values = {
          name: title,
          category: String(form.get("category")) as WorkspaceCategory,
          description,
          icon: String(form.get("icon") || "folder"),
        };
        if (editor.item)
          check(
            await client()
              .from("workspaces")
              .update(values)
              .eq("id", editor.item.id),
          );
        else {
          const row = check(
            await client().from("workspaces").insert(values).select().single(),
          );
          router.push(workspacePath(row.id));
        }
        await loadWorkspaces();
      } else if (editor.kind === "activity") {
        const workspaceId = editorWorkspace?.id;
        if (!workspaceId) throw new Error("Selecione um workspace.");
        const category_attributes = attributesFromForm(
          editorWorkspace!.category,
          form,
          editor.item?.category_attributes,
        );
        if (editor.item)
          check(
            await client()
              .from("activities")
              .update({ title, description, category_attributes })
              .eq("id", editor.item.id),
          );
        else {
          const row = check(
            await client()
              .from("activities")
              .insert({
                title,
                description,
                workspace_id: workspaceId,
                category_attributes,
              })
              .select()
              .single(),
          );
          router.push(workspacePath(workspaceId, "activities", row.id));
        }
        await loadContent();
      } else {
        const workspaceId = editorWorkspace?.id;
        if (!workspaceId) throw new Error("Selecione um workspace.");
        if (editor.item)
          check(
            await client()
              .from("notes")
              .update({ title })
              .eq("id", editor.item.id),
          );
        else {
          const row = check(
            await client()
              .from("notes")
              .insert({ title, workspace_id: workspaceId })
              .select()
              .single(),
          );
          router.push(workspacePath(workspaceId, "notes", row.id));
        }
        await loadContent();
      }
      setEditor(null);
      report("Salvo com sucesso.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function workspaceArchive(w: Workspace) {
    setBusy(true);
    try {
      check(
        await client()
          .from("workspaces")
          .update({ archived: !w.archived })
          .eq("id", w.id),
      );
      await loadWorkspaces();
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteWorkspace(w: Workspace) {
    if (
      prompt(
        t(
          "Esta ação exclui atividades, notas e arquivos. Digite o nome do workspace para confirmar: {{name}}",
          { name: w.name },
        ),
      ) !== w.name
    )
      return;
    setBusy(true);
    try {
      check(await client().rpc("delete_workspace", { p_workspace: w.id }));
      if (workspaceId === w.id) router.push("/workspaces");
      await loadWorkspaces();
      report(
        "Workspace excluído. Objetos privados serão removidos pela rotina de limpeza.",
      );
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount() {
    if (
      prompt(
        t(
          "Esta ação exclui permanentemente sua conta e registros. Digite seu e-mail para confirmar:",
        ),
      ) !== user?.email
    )
      return;
    setBusy(true);
    try {
      check(await client().rpc("delete_my_account"));
      await client().auth.signOut({ scope: "local" });
      setUser(null);
      report("Conta excluída.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setBusy(true);
    try {
      const output: Record<string, unknown[]> = {};
      for (const table of [
        "workspaces",
        "activities",
        "activity_events",
        "notes",
        "note_entries",
        "attachments",
        "audit_logs",
        "priority_history",
        "workspace_observations",
        "workspace_events",
      ]) {
        let offset = 0;
        output[table] = [];
        while (true) {
          const rows = check(
            await client()
              .from(table)
              .select("*")
              .order("id")
              .range(offset, offset + 499),
          );
          output[table].push(...rows);
          if (rows.length < 500) break;
          offset += 500;
        }
      }
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(output, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "tasknado-export.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      report("Exportação gerada. Baixe os anexos separadamente.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function openResult(r: SearchResult) {
    let path = workspacePath(r.workspace_id);
    if (r.kind === "workspace_observation")
      path = workspacePath(r.workspace_id, "observations") + "?focus=" + r.id;
    else if (
      ["activity", "event"].includes(r.kind) ||
      (r.kind === "file" && r.excerpt === "activity")
    )
      path =
        workspacePath(r.workspace_id, "activities", r.parent_id) +
        (r.kind === "event" ? "?focus=" + r.id : "");
    else if (r.kind !== "workspace")
      path =
        workspacePath(r.workspace_id, "notes", r.parent_id) +
        (r.kind === "entry" ? "?focus=" + r.id : "");
    go(path);
  }
  const shown = activities
    .filter(
      (a) =>
        a.archived === archived &&
        (!filter ||
          (filter === "started" ? isStarted(a.status) : a.status === filter)) &&
        (workspace?.category !== "university" ||
          !canvasFilter ||
          String(a.category_attributes.university?.openedInCanvas) ===
            canvasFilter) &&
        (workspace?.category !== "work" ||
          ((!scheduleFilter ||
            (scheduleFilter === "overdue"
              ? isOverdue(a)
              : scheduleFilter === "yes"
                ? !!a.category_attributes.work?.hasScheduledDate
                : !a.category_attributes.work?.hasScheduledDate)) &&
            (!dateFrom ||
              (a.category_attributes.work?.scheduledDate || "") >= dateFrom) &&
            (!dateTo ||
              (!!a.category_attributes.work?.scheduledDate &&
                a.category_attributes.work.scheduledDate <= dateTo)))) &&
        `${a.title} ${a.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "scheduled"
        ? (a.category_attributes.work?.scheduledDate || "9999")
            .concat(a.category_attributes.work?.scheduledTime || "23:59")
            .localeCompare(
              (b.category_attributes.work?.scheduledDate || "9999").concat(
                b.category_attributes.work?.scheduledTime || "23:59",
              ),
            )
        : sort === "title"
          ? a.title.localeCompare(b.title, locale)
          : b[sort as "created_at" | "updated_at"].localeCompare(
              a[sort as "created_at" | "updated_at"],
            ),
    );
  if (!db) return <Auth onRecovered={() => setRecovery(false)} />;
  if (!ready)
    return (
      <main className="setup" role="status">
        <BrandLogo layout="vertical" />
        <p>{t("Abrindo seu espaço…")}</p>
      </main>
    );
  if (!user || recovery)
    return (
      <Auth
        key={recovery ? "recovery" : "auth"}
        recovery={recovery}
        onRecovered={() => setRecovery(false)}
      />
    );
  const navItems: { id: View; label: string; icon: typeof Folder }[] = [
    { id: "dashboard", label: t("Visão geral"), icon: LayoutDashboard },
    { id: "activities", label: t("Atividades"), icon: ListTodo },
    { id: "notes", label: t("Bloco de notas"), icon: NotebookPen },
  ];
  const counts = (["not_started", "in_progress"] as Status[]).map((status) => ({
    status,
    count: activities.filter(
      (a) =>
        (status === "in_progress"
          ? isStarted(a.status)
          : a.status === status) && !a.archived,
    ).length,
  }));
  const statusIcons = {
    not_started: Circle,
    in_progress: Play,
    paused: Pause,
    completed: CheckCircle2,
  };
  return (
    <DesktopShell
      user={user}
      workspaces={workspaces}
      workspace={workspace}
      activities={activities}
      view={view}
      canLeave={canLeave}
      go={go}
      onCreate={() => setEditor({ kind: "workspace" })}
      onResult={openResult}
      onSignOut={async () => {
        if (!canLeave()) return;
        try {
          check(await client().auth.signOut());
        } catch (e) {
          report(errorMessage(e));
        }
      }}
    >
      <main className="main-content" id="main" tabIndex={-1}>
        {workspace && (
          <>
            <div
              key={workspace.id}
              className="ocean-transition"
              aria-hidden="true"
            >
              <svg viewBox="0 0 1200 80" preserveAspectRatio="none">
                <path d="M0 40 Q150 0 300 40 T600 40 T900 40 T1200 40 V80 H0Z" />
              </svg>
            </div>
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">
                  {t(workspaceCategories[workspace.category])}
                </span>
                <h1>{workspace.name}</h1>
                {workspace.description && <p>{workspace.description}</p>}
                <small>
                  {t("Última atualização")} · {date(workspace.updated_at)}
                </small>
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  setEditor({ kind: "workspace", item: workspace })
                }
              >
                {t("Editar workspace")}
              </Button>
            </div>
            <nav className="workspace-tabs" aria-label={t("Abas do Workspace")}>
              {workspaceTabs
                .filter(
                  (tab) =>
                    tab.view !== "matrix" || workspace.category === "work",
                )
                .map((tab) => (
                  <Link
                    key={tab.view}
                    href={workspacePath(workspace.id, tab.view)}
                    onNavigate={(e) => {
                      if (!canLeave()) e.preventDefault();
                    }}
                    aria-current={view === tab.view ? "page" : undefined}
                  >
                    {t(tab.label)}
                  </Link>
                ))}
            </nav>
          </>
        )}
        {loadError && (
          <p role="alert" className="error">
            {t(loadError)}{" "}
            <Button
              variant="ghost"
              onClick={() =>
                void loadContent().catch((e) => report(errorMessage(e)))
              }
            >
              {t("Tentar novamente")}
            </Button>
          </p>
        )}

        {isProfile ? (
          <Profile
            key={user.id}
            user={user}
            onSaved={setUser}
            report={report}
            onDirty={onDirty}
          />
        ) : view === "search" ? (
          <GlobalSearch
            workspaces={workspaces}
            onOpen={(r) => void openResult(r)}
            report={report}
          />
        ) : view === "settings" ? (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">{t("DO SEU JEITO")}</span>
                <h1>{t("Configurações")}</h1>
                <p>{t("Gerencie seus espaços e seus dados pessoais.")}</p>
              </div>
              <Button onClick={() => setEditor({ kind: "workspace" })}>
                <Plus size={16} /> {t("Novo workspace")}
              </Button>
            </div>
            <section className="panel settings-panel">
              <h2>{t("Seus workspaces")}</h2>
              {workspaces.map((w) => (
                <div className="settings-row" key={w.id}>
                  <div>
                    <strong>{w.name}</strong>
                    <p>
                      {w.description || t("Sem descrição")}{" "}
                      {w.archived ? `· ${t("Arquivado")}` : ""}
                    </p>
                  </div>
                  <div className="row">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        switchWorkspace(w.id);
                      }}
                    >
                      {t("Abrir")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setEditor({ kind: "workspace", item: w })}
                    >
                      {t("Editar")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void workspaceArchive(w)}
                    >
                      <Archive size={16} />
                      {w.archived ? t("Restaurar") : t("Arquivar")}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy}
                      aria-label={t("Excluir {{name}}", { name: w.name })}
                      onClick={() => void deleteWorkspace(w)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </section>
            <LanguageSettings />
            <section className="panel settings-panel">
              <h2>{t("Conta e privacidade")}</h2>
              <p>{user.email}</p>
              <p className="muted">
                {t(
                  "Exportação de registros em JSON. Arquivos devem ser baixados individualmente. Para excluir o conteúdo, exclua os workspaces acima.",
                )}
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void exportData()}
              >
                <Download size={16} /> {t("Exportar meus dados")}
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void deleteAccount()}
              >
                {t("Excluir minha conta")}
              </Button>
              <p className="hint">
                {t(
                  "A exclusão é permanente. Backups seguem a retenção do projeto; arquivos entram na fila de limpeza.",
                )}
              </p>
            </section>
          </>
        ) : view === "workspaces" ? (
          <WorkspaceDirectory
            workspaces={workspaces}
            onOpen={switchWorkspace}
            onCreate={() => setEditor({ kind: "workspace" })}
          />
        ) : workspaceId && !workspace ? (
          <p role="status">
            {t(loading ? "Carregando…" : "Workspace indisponível.")}
          </p>
        ) : view === "observations" && workspace ? (
          <WorkspaceObservations
            key={workspace.id}
            workspaceId={workspace.id}
            focusId={focusId}
            report={report}
          />
        ) : view === "history" && workspace ? (
          <WorkspaceHistory
            key={workspace.id}
            workspaceId={workspace.id}
            onOpen={setActivityId}
          />
        ) : view === "matrix" && workspace ? (
          workspace.category === "work" ? (
            <PriorityMatrix
              activities={activities}
              onOpen={setActivityId}
              onChange={loadContent}
              report={report}
            />
          ) : (
            <p>{t("A matriz está disponível na categoria Trabalho.")}</p>
          )
        ) : !workspaces.length ? (
          <div className="welcome panel">
            <span className="eyebrow">{t("BEM-VINDO AO SEU NOVO ESPAÇO")}</span>
            <h1>
              {t("Organização começa")}
              <br />
              {t("com um lugar para começar.")}
            </h1>
            <p>
              {t(
                "Crie um workspace para separar seus projetos, estudos ou trabalho.",
              )}
              <br />
              {t("Suas atividades e notas vão morar aqui.")}
            </p>
            <Button onClick={() => setEditor({ kind: "workspace" })}>
              <Plus size={18} /> {t("Criar meu primeiro workspace")}
            </Button>
            <div className="welcome-steps">
              <span>{t("01 · Organize por assunto")}</span>
              <span>{t("02 · Registre cada avanço")}</span>
              <span>{t("03 · Retome com contexto")}</span>
            </div>
          </div>
        ) : view === "notes" ? (
          <>
            <Notes
              notes={notes}
              selectedId={noteId}
              onSelect={(id) => {
                if (canLeave()) setNoteId(id);
              }}
              onCreate={() => {
                if (canLeave()) setEditor({ kind: "note" });
              }}
              onRename={(item) => setEditor({ kind: "note", item })}
              onDirty={onDirty}
              report={report}
            />
            {noteMore && (
              <Button variant="ghost" onClick={() => setLimit((x) => x + 50)}>
                {t("Carregar mais notas")}
              </Button>
            )}
          </>
        ) : selected && view === "activities" ? (
          <ActivityDetail
            key={selected.id}
            activity={selected}
            category={workspace!.category}
            focusId={focusId}
            onBack={() => setActivityId(null)}
            onChange={loadContent}
            onEdit={() => setEditor({ kind: "activity", item: selected })}
            report={report}
          />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {view === "dashboard"
                    ? t("CADA AVANÇO CONTA")
                    : workspace?.name.toUpperCase() || t("MEU ESPAÇO")}
                </span>
                <h1>
                  {view === "dashboard"
                    ? workspace
                      ? t("Visão geral")
                      : t("Início")
                    : t("Atividades")}
                </h1>
                <p>
                  {view === "dashboard"
                    ? t("Tudo o que você precisa para continuar de onde parou.")
                    : t("Acompanhe cada etapa. Preserve todo o contexto.")}
                </p>
              </div>
              <Button onClick={() => setEditor({ kind: "activity" })}>
                <Plus size={18} /> {t("Nova atividade")}
              </Button>
            </div>
            {view === "dashboard" && (
              <>
                <div className="stats-grid">
                  {counts.map(({ status, count }) => {
                    const Icon = statusIcons[status];
                    return (
                      <button
                        key={status}
                        className={"panel stat " + status}
                        onClick={() => {
                          setFilter(
                            status === "in_progress" ? "started" : status,
                          );
                          setView("activities");
                          setArchived(false);
                        }}
                      >
                        <div className="row between">
                          <span>
                            {t(
                              status === "not_started"
                                ? "Atividades em aberto"
                                : "Em andamento",
                            )}
                          </span>
                        </div>
                        <strong>
                          {number(count)}
                          {hasMore ? "+" : ""}
                        </strong>
                        <small>
                          {t("Ver atividades")} <ArrowUpRight size={13} />
                        </small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <section className="panel activities-panel">
              <div className="section-heading">
                <div className="row">
                  <h2>
                    {view === "dashboard"
                      ? t("Atividades recentes")
                      : t("Todas as atividades")}
                  </h2>
                  {view !== "dashboard" && (
                    <span className="count">{number(shown.length)}</span>
                  )}
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    setArchived((x) => !x);
                    setView("activities");
                  }}
                >
                  <Archive size={15} />
                  {archived ? t("Ver ativas") : t("Arquivadas")}
                </button>
              </div>
              {view !== "dashboard" && (
                <>
                  <div className="list-toolbar">
                    <div className="filter-tabs">
                      {filter === "started" && (
                        <button
                          className="active"
                          onClick={() => setFilter("")}
                        >
                          {t("Iniciadas e não concluídas")} ×
                        </button>
                      )}
                      <button
                        className={!filter ? "active" : ""}
                        onClick={() => setFilter("")}
                      >
                        {t("Todas")}
                      </button>
                      {Object.entries(statuses).map(([s, label]) => (
                        <button
                          className={filter === s ? "active" : ""}
                          key={s}
                          onClick={() => setFilter(s)}
                        >
                          {t(label)}
                        </button>
                      ))}
                    </div>
                    <div className="row">
                      <label className="search-input compact">
                        <Search size={15} />
                        <input
                          aria-label={t("Filtrar atividades")}
                          placeholder={t("Filtrar…")}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label={t("Ordenar atividades")}
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="updated_at">{t("Atualização")}</option>
                        <option value="created_at">{t("Criação")}</option>
                        <option value="title">{t("Nome")}</option>
                        {workspace?.category === "work" && (
                          <option value="scheduled">
                            {t("Data programada")}
                          </option>
                        )}
                      </select>
                    </div>
                  </div>
                  {workspace?.category === "university" && (
                    <div className="list-toolbar">
                      <label>
                        {t("Aberta no Canvas?")}
                        <select
                          value={canvasFilter}
                          onChange={(e) => setCanvasFilter(e.target.value)}
                        >
                          <option value="">{t("Todas")}</option>
                          <option value="true">{t("Sim")}</option>
                          <option value="false">{t("Não")}</option>
                          <option value="undefined">{t("Não definida")}</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {workspace?.category === "work" && (
                    <div className="list-toolbar category-filters">
                      <label>
                        {t("Agendamento")}
                        <select
                          value={scheduleFilter}
                          onChange={(e) => setScheduleFilter(e.target.value)}
                        >
                          <option value="">{t("Todas")}</option>
                          <option value="yes">
                            {t("Com data programada")}
                          </option>
                          <option value="no">{t("Sem data programada")}</option>
                          <option value="overdue">{t("Atrasada")}</option>
                        </select>
                      </label>
                      <label>
                        {t("Data inicial")}
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        {t("Data final")}
                        <input
                          type="date"
                          value={dateTo}
                          min={dateFrom}
                          onChange={(e) => setDateTo(e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
              <div className="activity-table">
                <div className="table-head">
                  <span>{t("ATIVIDADE")}</span>
                  <span>{t("STATUS")}</span>
                  <span>{t("Classificação")}</span>
                  <span>{t("Criação")}</span>
                  <span>{t("ATUALIZADA EM")}</span>
                  <span>{t("Observações")}</span>
                </div>
                {shown
                  .slice(0, view === "dashboard" ? 6 : undefined)
                  .map((a) => {
                    const Icon = statusIcons[a.status];
                    return (
                      <button
                        className="activity-row"
                        key={a.id}
                        onClick={() => {
                          setActivityId(a.id);
                        }}
                      >
                        <div className="activity-title">
                          <span className="activity-symbol">
                            <Icon size={17} />
                          </span>
                          <div>
                            <strong>{a.title}</strong>
                            {workspace?.category === "work" && (
                              <span
                                className={isOverdue(a) ? "overdue" : "hint"}
                              >
                                <Schedule work={a.category_attributes.work} />
                                {isOverdue(a) && ` · ${t("Atrasada")}`}
                              </span>
                            )}
                            <p>
                              {a.description ||
                                t("Seu próximo registro começa aqui.")}
                            </p>
                          </div>
                        </div>
                        <span className={"badge " + a.status}>
                          <Icon size={12} />
                          {t(statuses[a.status])}
                        </span>
                        <span className="classification">
                          {(
                            workspace ||
                            workspaces.find((w) => w.id === a.workspace_id)
                          )?.category === "work"
                            ? t(quadrants[quadrant(a.category_attributes.work)])
                                .split(" · ")
                                .slice(0, 2)
                                .join(" · ")
                            : (
                                  workspace ||
                                  workspaces.find(
                                    (w) => w.id === a.workspace_id,
                                  )
                                )?.category === "university"
                              ? "Canvas: " +
                                t(
                                  a.category_attributes.university
                                    ?.openedInCanvas === true
                                    ? "Sim"
                                    : a.category_attributes.university
                                          ?.openedInCanvas === false
                                      ? "Não"
                                      : "Não definida",
                                )
                              : "—"}
                        </span>
                        <time title={date(a.created_at)}>
                          {new Intl.DateTimeFormat(locale).format(
                            new Date(a.created_at),
                          )}
                        </time>
                        <time title={date(a.updated_at)}>
                          {new Intl.DateTimeFormat(locale).format(
                            new Date(a.updated_at),
                          )}
                        </time>
                        <span className="observation-count">
                          {number(observationCounts[a.id] || 0)}
                        </span>
                      </button>
                    );
                  })}
              </div>
              {!shown.length && (
                <div className="empty">
                  <ListTodo size={32} />
                  <h3>
                    {query || filter
                      ? t("Nenhuma atividade neste filtro")
                      : t("Dê espaço ao seu próximo projeto")}
                  </h3>
                  <p>
                    {query || filter
                      ? t("Ajuste os filtros para encontrar suas atividades.")
                      : t(
                          "Crie uma atividade e mantenha cada etapa da sua jornada registrada.",
                        )}
                  </p>
                  {!query && !filter && (
                    <Button
                      variant="secondary"
                      onClick={() => setEditor({ kind: "activity" })}
                    >
                      <Plus size={16} /> {t("Criar atividade")}
                    </Button>
                  )}
                </div>
              )}
              <div className="table-footer">
                <span>
                  {loading
                    ? t("Atualizando…")
                    : view === "dashboard"
                      ? t("Atualizações recentes")
                      : t("taskCount", {
                          count: shown.length,
                          workspace:
                            workspace?.name || t("Todos os workspaces"),
                        })}
                </span>
                {hasMore ? (
                  <Button
                    variant="ghost"
                    onClick={() => setLimit((x) => x + 50)}
                  >
                    {t("Carregar mais")}
                  </Button>
                ) : (
                  <span>
                    <LockKeyhole size={12} /> {t("Visível somente para você")}
                  </span>
                )}
              </div>
            </section>
            {view === "dashboard" && (
              <RecentObservations
                workspaceId={workspaceId}
                onOpen={openResult}
              />
            )}
          </>
        )}
      </main>
      <footer className="app-footer">
        <span>{t("Tasknado · Sua memória operacional")}</span>
        <span>{t("Um passo de cada vez.")}</span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <span>{t(toast)}</span>
          <button
            className="icon-button"
            aria-label={t("Dispensar aviso")}
            onClick={() => setToast("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {editor && (
        <Modal
          title={t(
            editor.kind === "workspace"
              ? editor.item
                ? "Editar workspace"
                : "Criar workspace"
              : editor.kind === "activity"
                ? editor.item
                  ? "Editar atividade"
                  : "Criar atividade"
                : editor.item
                  ? "Editar nota"
                  : "Criar nota",
          )}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
          description={
            editor.kind === "workspace"
              ? t("Separe seus assuntos em espaços privados.")
              : t("Dê um nome claro para encontrar este conteúdo depois.")
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(new FormData(e.currentTarget));
            }}
          >
            <label>
              {editor.kind === "workspace" ? t("Nome") : t("Título")}
              <input
                name="title"
                autoFocus
                defaultValue={
                  editor.item
                    ? "name" in editor.item
                      ? editor.item.name
                      : editor.item.title
                    : ""
                }
                required
                maxLength={editor.kind === "workspace" ? 120 : 200}
              />
            </label>
            {editor.kind !== "workspace" && !workspace && (
              <label>
                {t("Workspace")}
                <select
                  value={editorWorkspace?.id || ""}
                  required
                  onChange={(e) => setEditorWorkspaceId(e.target.value)}
                >
                  {workspaces
                    .filter((w) => !w.archived)
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {editor.kind !== "note" && (
              <label>
                {t("Descrição")}
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={
                    editor.item && "description" in editor.item
                      ? editor.item.description
                      : ""
                  }
                  maxLength={10000}
                />
              </label>
            )}
            {editor.kind === "activity" && editorWorkspace && (
              <CategoryFields
                category={editorWorkspace.category}
                attributes={editor.item?.category_attributes}
              />
            )}
            {editor.kind === "workspace" && (
              <label>
                {t("Categoria do workspace")}
                <select
                  name="category"
                  required
                  defaultValue={editor.item?.category || ""}
                >
                  <option value="" disabled>
                    {t("Selecione uma opção")}
                  </option>
                  {Object.entries(workspaceCategories).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
                <small>
                  {t(
                    "Ao trocar a categoria, os atributos anteriores ficam preservados e ocultos até reativá-la.",
                  )}
                </small>
              </label>
            )}
            {editor.kind === "workspace" && (
              <label>
                {t("Ícone")}
                <select
                  name="icon"
                  defaultValue={editor.item?.icon || "folder"}
                >
                  <option value="folder">{t("Pasta")}</option>
                  <option value="briefcase">{t("Trabalho")}</option>
                  <option value="book">{t("Estudos")}</option>
                  <option value="wallet">{t("Finanças")}</option>
                  <option value="code">{t("Projetos")}</option>
                </select>
              </label>
            )}
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                {t("Cancelar")}
              </Button>
              <Button disabled={busy}>
                {busy ? t("Salvando…") : t("Salvar")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </DesktopShell>
  );
}
function HistoryIcon() {
  return <ListTodo size={25} />;
}
