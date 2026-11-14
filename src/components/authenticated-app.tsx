"use client";
import { WindowedList } from "./windowed-list";
import { useI18n } from "@/i18n/provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAppData, useDebounced, localMinute } from "@/hooks/use-app-data";
import { invalidateActivity, invalidateNotes } from "@/lib/data-queries";
import { SessionData } from "./session-data";
import { tabsFor } from "./nav-items";
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
  ArrowUpRight,
  MessageSquare,
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
  SlidersHorizontal,
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
  matchesTaskIndicator,
} from "@/lib/domain";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
const ActivityDetail = dynamic(() => import("./activity-detail").then(m => m.ActivityDetail));
const Notes = dynamic(() => import("./notes").then(m => m.Notes));
const GlobalSearch = dynamic(() => import("./search").then(m => m.GlobalSearch));
import { BrandLogo } from "./brand";
const Profile = dynamic(() => import("./profile").then(m => m.Profile));
import { LanguageSettings } from "./language-settings";
import { ThemeSettings } from "./theme";
import {
  CategoryFields,
  attributesFromForm,
  Schedule,
} from "./category-fields";
const PriorityMatrix = dynamic(() => import("./priority-matrix").then(m => m.PriorityMatrix));
import { routeState, workspacePath, View } from "@/lib/navigation";
import { DesktopShell } from "./desktop-shell";
import { WorkspaceObservations, WorkspaceHistory } from "./workspace-records";
import { WorkspaceDirectory, RecentObservations } from "./workspace-overview";
import { DashboardFocus } from "./dashboard-focus";
import { quadrant, quadrants, isStarted } from "@/lib/domain";
import { isGone, removeNote } from "@/lib/notes";
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ProfessionalPlans = dynamic(() =>
  import("./professional-plans").then((m) => m.ProfessionalPlans),
);
type Editor =
  | { kind: "workspace"; item?: Workspace }
  | { kind: "activity"; item?: Activity }
  | { kind: "note"; item?: Note };
export function AuthenticatedApp(props: {user: User; setUser: (user: User | null) => void}) {
  return <SessionData><AuthenticatedContent {...props} /></SessionData>;
}
function AuthenticatedContent({user, setUser}: {user: User; setUser: (user: User | null) => void}) {
  const { t, date, number, locale, shortDate } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isProfile = pathname === "/perfil";
  const { workspaceId, view, activityId, noteId, careerId } =
    routeState(pathname);
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const requestedFilter = searchParams.get("status") || "";
  const filter =
    requestedFilter === "started" || Object.hasOwn(statuses, requestedFilter)
      ? requestedFilter
      : "";
  function setFilter(value: string) {
    if (!canLeave()) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("status", value);
    else params.delete("status");
    const path = workspaceId
      ? workspacePath(workspaceId, "activities")
      : "/activities";
    router.push(path + (params.size ? "?" + params.toString() : ""));
  }
  const [editorWorkspaceId, setEditorWorkspaceId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [archived, setArchived] = useState(false),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("updated_at");
  const [canvasFilter, setCanvasFilter] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Phones keep the category filters folded away until asked for.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const dirty = useRef(new Set<string>());
  const [professionalVisited, setProfessionalVisited] = useState(false);
  useEffect(() => {
    if (!user) setProfessionalVisited(false);
    else if (view === "development" || view === "career")
      setProfessionalVisited(true);
  }, [view, user?.id]);
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
  const [noteSearch, setNoteSearch] = useState("");
  const [noteSort, setNoteSort] = useState("updated_at");
  const [now, setNow] = useState(localMinute);
  useEffect(() => { const timer = setInterval(() => setNow(localMinute()), 60_000); return () => clearInterval(timer); }, []);
  const search = useDebounced(query);
  const data = useAppData({ workspaceId, activityId, noteId: noteId && uuid.test(noteId) ? noteId : null, view: isProfile ? "settings" : view,
    filters: {status: filter, archived, query: search, canvas: canvasFilter, schedule: scheduleFilter, from: dateFrom, to: dateTo, ...(scheduleFilter === "overdue" ? {localNow: now} : {})}, sort,
    noteSearch: useDebounced(noteSearch), noteSort });
  const { cache, workspaces, activities, notes, workspace, selected, workspaceMap, activityMap, observationCounts, loading, loadError, hasMore, noteMore } = data;
  const loadWorkspaces = data.refreshWorkspaces;
  useEffect(() => {
    if (data.noteMissing || (view === "notes" && noteId && !uuid.test(noteId))) {
      report("Esta nota não está mais disponível.");
      router.replace(workspacePath(workspaceId!, "notes"));
    }
  }, [data.noteMissing, noteId, workspaceId]);
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
  function setActivityId(id: string | null, sourceWorkspace?: string) {
    const a = activityMap.get(id || "");
    const path = id
      ? workspacePath(sourceWorkspace || a?.workspace_id || workspaceId!, "activities", id)
      : workspaceId
        ? workspacePath(workspaceId, "activities")
        : "/activities";
    go(path + (filter ? "?status=" + filter : ""));
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
    setQuery("");
    setArchived(false);
    setCanvasFilter("");
    setScheduleFilter("");
    setDateFrom("");
    setDateTo("");
    setSort("updated_at");
    setFiltersOpen(false);
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
        await invalidateActivity(cache, workspaceId, editor.item?.id);
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
        await invalidateNotes(cache, workspaceId);
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
          "Esta ação exclui atividades, notas, arquivos, PDI e planos de carreira. Digite o nome do workspace para confirmar: {{name}}",
          { name: w.name },
        ),
      ) !== w.name
    )
      return;
    setBusy(true);
    try {
      check(await client().rpc("delete_workspace", { p_workspace: w.id }));
      await cache.cancelQueries();
      await cache.invalidateQueries();
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
  async function deleteNote(note: Note, nextId: string | null) {
    let gone = false;
    try {
      await removeNote(client(), note.id);
    } catch (e) {
      // Already deleted elsewhere: the screen still has to let go of it.
      if (!isGone(e)) throw e;
      gone = true;
    }
    await data.refreshNotes(note.id);
    if (noteId === note.id) {
      const next = notes.find((item) => item.id === nextId);
      router.replace(
        next
          ? workspacePath(next.workspace_id, "notes", next.id)
          : workspaceId
            ? workspacePath(workspaceId, "notes")
            : "/notes",
      );
    }
    report(gone ? "Esta nota não está mais disponível." : "Nota excluída.");
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
      const { exportUserDataBlob } = await import("@/lib/export-data");
      const output = await exportUserDataBlob(client());
      const url = URL.createObjectURL(output);
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
  const shown = activities;
  const counts = (["not_started", "in_progress", "completed"] as const).map(status => ({ status,
    count: data.counts?.[status === "in_progress" ? "started" : status] ?? 0,
  }));
  const advancedFilters = [
    canvasFilter,
    scheduleFilter,
    dateFrom,
    dateTo,
  ].filter(Boolean).length;
  const statusIcons = {
    not_started: Circle,
    in_progress: Play,
    paused: Pause,
    completed: CheckCircle2,
  };
  // The one creation that makes sense on the current screen. Phones show it in
  // the header, where it stays reachable while the page scrolls.
  const createWorkspace = {
    label: "Criar workspace",
    run: () => setEditor({ kind: "workspace" }),
  };
  const createActivity = {
    label: "Nova atividade",
    run: () => setEditor({ kind: "activity" }),
  };
  const action =
    isProfile ||
    ["search", "observations", "history", "development", "career"].includes(
      view,
    )
      ? undefined
      : view === "settings" || view === "workspaces"
        ? createWorkspace
        : workspaceId && !workspace
          ? undefined
          : !workspaces.length
            ? createWorkspace
            : view === "notes"
              ? {
                  label: "Nova nota",
                  run: () => {
                    if (canLeave()) setEditor({ kind: "note" });
                  },
                }
              : view === "matrix"
                ? workspace?.category === "work"
                  ? createActivity
                  : undefined
                : selected && view === "activities"
                  ? undefined
                  : createActivity;
  return (
    <DesktopShell
      user={user}
      workspaces={workspaces}
      workspace={workspace}
      activities={data.recent}
      view={view}
      action={action}
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
            <div
              className={
                view === "dashboard"
                  ? "workspace-heading"
                  : "workspace-heading secondary"
              }
            >
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
                onClick={() => {
                  if (canLeave())
                    setEditor({ kind: "workspace", item: workspace });
                }}
              >
                {t("Editar workspace")}
              </Button>
            </div>
            <nav className="workspace-tabs" aria-label={t("Abas do Workspace")}>
              {tabsFor(workspace.category).map((tab) => (
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
                void data.retry()
              }
            >
              {t("Tentar novamente")}
            </Button>
          </p>
        )}

        {professionalVisited && (
          <ProfessionalPlans
            key={user.id}
            workspace={workspace}
            view={workspaceId && !workspace ? "dashboard" : view}
            careerId={careerId}
            report={report}
            onDirty={onDirty}
            go={go}
          />
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
              <Button
                className="heading-action"
                onClick={() => setEditor({ kind: "workspace" })}
              >
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
            <ThemeSettings />
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
        ) : view === "development" || view === "career" ? (
          !professionalVisited ? (
            <p role="status">{t("Carregando…")}</p>
          ) : null
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
              workspaceId={workspace.id}
              onOpen={setActivityId}
              onChange={data.refreshActivity}
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
              key={workspaceId || "all"}
              query={noteSearch}
              onQuery={setNoteSearch}
              order={noteSort}
              onOrder={setNoteSort}
              notes={notes}
              selectedId={noteId && uuid.test(noteId) ? noteId : null}
              onSelect={(id) => {
                if (canLeave()) setNoteId(id);
              }}
              onCreate={() => {
                if (canLeave()) setEditor({ kind: "note" });
              }}
              onRename={(item) => setEditor({ kind: "note", item })}
              onDelete={deleteNote}
              onDirty={onDirty}
              report={report}
            />
            {noteMore && (
              <Button variant="ghost" disabled={data.loadingMoreNotes} onClick={() => void data.loadMoreNotes()}>
                {t("Carregar mais notas")}
              </Button>
            )}
          </>
        ) : activityId && view === "activities" && !selected ? (
          <p role="status">{t(loading ? "Carregando…" : "Atividade indisponível.")}</p>
        ) : selected && view === "activities" ? (
          <ActivityDetail
            key={selected.id}
            activity={selected}
            category={workspace!.category}
            focusId={focusId}
            onBack={() => setActivityId(null)}
            onChange={data.refreshActivity}
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
              <Button
                className="heading-action"
                onClick={() => setEditor({ kind: "activity" })}
              >
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
                          setArchived(false);
                        }}
                      >
                        <div className="row between">
                          <span>
                            {t(
                              status === "not_started"
                                ? "Atividades em aberto"
                                : status === "completed"
                                  ? "Tarefas finalizadas"
                                  : "Em andamento",
                            )}
                          </span>
                          <span className="stat-icon" aria-hidden="true">
                            <Icon size={15} />
                          </span>
                        </div>
                        <strong>
                          {number(count)}

                        </strong>
                        <small>
                          {t("Ver atividades")} <ArrowUpRight size={13} />
                        </small>
                      </button>
                    );
                  })}
                </div>
                <DashboardFocus
                  workspaceId={workspaceId}
                  workspaces={workspaces}
                  workspace={workspace}
                  onOpen={setActivityId}
                  onSeeStarted={() => {
                    setFilter("started");
                    setArchived(false);
                  }}
                />
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
                    <span className="count">{number(data.total ?? shown.length)}</span>
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
                  {filter === "completed" && !archived && (
                    <p className="hint">
                      {t("Inclui tarefas finalizadas arquivadas.")}
                    </p>
                  )}
                  <div className="list-toolbar">
                    <div className="filter-tabs">
                      {filter === "started" && (
                        <button
                          className="active"
                          aria-pressed="true"
                          onClick={() => setFilter("")}
                        >
                          {t("Iniciadas e não concluídas")} ×
                        </button>
                      )}
                      <button
                        className={!filter ? "active" : ""}
                        aria-pressed={!filter}
                        onClick={() => setFilter("")}
                      >
                        {t("Todas")}
                      </button>
                      {Object.entries(statuses).map(([s, label]) => (
                        <button
                          className={filter === s ? "active" : ""}
                          aria-pressed={filter === s}
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
                      {(workspace?.category === "university" ||
                        workspace?.category === "work") && (
                        <button
                          type="button"
                          className="text-button filter-toggle"
                          aria-expanded={filtersOpen}
                          aria-controls="advanced-filters"
                          onClick={() => setFiltersOpen((open) => !open)}
                        >
                          <SlidersHorizontal size={15} aria-hidden="true" />
                          {t("Filtros")}
                          {advancedFilters > 0 && (
                            <span className="count">
                              {number(advancedFilters)}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {workspace?.category === "university" && (
                    <div
                      id="advanced-filters"
                      className={
                        "list-toolbar advanced-filters" +
                        (filtersOpen ? " open" : "")
                      }
                    >
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
                    <div
                      id="advanced-filters"
                      className={
                        "list-toolbar category-filters advanced-filters" +
                        (filtersOpen ? " open" : "")
                      }
                    >
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
                  <span title={t("Observações")}>
                    <MessageSquare size={14} aria-hidden="true" />
                    <span className="visually-hidden">{t("Observações")}</span>
                  </span>
                </div>
                <WindowedList rows={shown.slice(0, view === "dashboard" ? 6 : undefined)} label={t("Atividades")} render={(a) => {
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
                            <p
                              className={
                                a.description ? undefined : "placeholder"
                              }
                            >
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
                            workspaceMap.get(a.workspace_id)
                          )?.category === "work"
                            ? t(quadrants[quadrant(a.category_attributes.work)])
                                .split(" · ")
                                .slice(0, 2)
                                .join(" · ")
                            : (
                                  workspace ||
                                  workspaceMap.get(a.workspace_id)
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
                          <span className="cell-label">{t("Criação")}</span>{" "}
                          {shortDate(a.created_at)}
                        </time>
                        <time title={date(a.updated_at)}>
                          <span className="cell-label">{t("Atualização")}</span>{" "}
                          {shortDate(a.updated_at)}
                        </time>
                        <span className="observation-count">
                          <MessageSquare size={13} aria-hidden="true" />
                          <span className="visually-hidden">
                            {t("Observações")}
                          </span>{" "}
                          {number(observationCounts[a.id] || 0)}
                        </span>
                      </button>
                    );
                  }} />
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
                          count: data.total ?? shown.length,
                          workspace:
                            workspace?.name || t("Todos os workspaces"),
                        })}
                </span>
                {view !== "dashboard" && hasMore ? (
                  <Button
                    variant="ghost"
                    disabled={data.loadingMore}
                    onClick={() => void data.loadMore()}
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
