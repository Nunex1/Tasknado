"use client";
import { useI18n } from "@/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { BrandLogo, BrandSymbol, BrandWordmark } from "./brand";
import { ProfileMenu } from "./profile-menu";
import { Profile } from "./profile";
import { LanguageSettings } from "./language-settings";
import {
  CategoryFields,
  attributesFromForm,
  Schedule,
} from "./category-fields";
import { PriorityMatrix } from "./priority-matrix";
type View = "dashboard" | "activities" | "notes" | "search" | "settings";
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
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [recovery, setRecovery] = useState(false),
    [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [workspaceId, setWorkspaceId] = useState<string | null>(null),
    [activities, setActivities] = useState<Activity[]>([]),
    [notes, setNotes] = useState<Note[]>([]),
    [view, setView] = useState<View>("dashboard"),
    [activityId, setActivityId] = useState<string | null>(null),
    [noteId, setNoteId] = useState<string | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false),
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
    if (ready) setAccount(user?.id ?? null);
  }, [ready, user?.id, setAccount]);
  const loadSeq = useRef(0);
  const report = useCallback((s: string) => setToast(s), []);
  const onDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id);
    else dirty.current.delete(id);
  }, []);
  function canLeave() {
    if (!dirty.current.size) return true;
    report(
      "Há uma nota ainda não salva. Aguarde a confirmação ou resolva o erro antes de sair.",
    );
    return false;
  }
  const workspace = workspaces.find((w) => w.id === workspaceId),
    selected = activities.find((a) => a.id === activityId);
  async function loadWorkspaces() {
    const rows = check(
      await client().from("workspaces").select("*").order("created_at"),
    ) as Workspace[];
    setWorkspaces(rows);
    setWorkspaceId((id) =>
      rows.some((w) => w.id === id)
        ? id
        : rows.find((w) => !w.archived)?.id || null,
    );
  }
  async function allActivities(id: string) {
    const data: Activity[] = [];
    for (let offset = 0; ; offset += 500) {
      const rows = check(
        await client()
          .from("activities")
          .select("*")
          .eq("workspace_id", id)
          .order("id")
          .range(offset, offset + 499),
      );
      data.push(...rows);
      if (rows.length < 500) return { data, error: null };
    }
  }
  async function loadContent() {
    if (!workspaceId) {
      setActivities([]);
      setNotes([]);
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const [a, n] = await Promise.all([
        allActivities(workspaceId),
        client()
          .from("notes")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(limit),
      ]);
      const aa = check(a) as Activity[],
        nn = check(n) as Note[];
      if (activityId && !aa.some((item) => item.id === activityId)) {
        const row = check(
          await client()
            .from("activities")
            .select("*")
            .eq("id", activityId)
            .eq("workspace_id", workspaceId)
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
            .eq("workspace_id", workspaceId)
            .maybeSingle(),
        );
        if (row) nn.push(row as Note);
      }
      if (seq === loadSeq.current) {
        setActivities(aa);
        setNotes(nn);
        setHasMore(false);
        setNoteMore(nn.length === limit);
      }
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
        setWorkspaceId(null);
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
  }, [workspaceId, limit, activityId, noteId]);
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
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (!dirty.current.size) {
          setView("search");
          setActivityId(null);
          if (pathname === "/perfil") router.push("/");
        }
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", key);
    };
  }, [pathname, router]);
  function navigate(next: View) {
    if (!canLeave()) return;
    setView(next);
    setActivityId(null);
    setMenu(false);
    if (isProfile) router.push("/");
  }
  function navigateHome(event: { preventDefault: () => void }) {
    if (!canLeave()) {
      event.preventDefault();
      return;
    }
    setView("dashboard");
    setActivityId(null);
    setMenu(false);
    // The overview is already on this route; only reset the existing view.
    if (pathname === "/") event.preventDefault();
  }
  function switchWorkspace(id: string) {
    if (!canLeave()) return;
    setWorkspaceId(id);
    setActivities([]);
    setNotes([]);
    setActivityId(null);
    setNoteId(null);
    setLimit(50);
    setCanvasFilter("");
    setScheduleFilter("");
    setDateFrom("");
    setDateTo("");
    setSort("updated_at");
    setMenu(false);
  }
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
          setWorkspaceId(row.id);
        }
        await loadWorkspaces();
      } else if (editor.kind === "activity") {
        if (!workspaceId) throw new Error("Selecione um workspace.");
        const category_attributes = attributesFromForm(
          workspace!.category,
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
          setActivityId(row.id);
          setView("activities");
        }
        await loadContent();
      } else {
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
          setNoteId(row.id);
          setView("notes");
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
  async function openResult(r: SearchResult) {
    if (!canLeave()) return;
    setWorkspaceId(r.workspace_id);
    if (r.kind === "workspace") {
      setView("dashboard");
      setActivityId(null);
      return;
    }
    if (
      ["activity", "event"].includes(r.kind) ||
      (r.kind === "file" && r.excerpt === "activity")
    ) {
      try {
        const row = check(
          await client()
            .from("activities")
            .select("*")
            .eq("id", r.parent_id)
            .single(),
        ) as Activity;
        setActivities((prev) => [row, ...prev.filter((a) => a.id !== row.id)]);
        setActivityId(row.id);
        setView("activities");
      } catch (e) {
        report(errorMessage(e));
      }
    } else {
      setNoteId(r.parent_id);
      setView("notes");
    }
  }
  const shown = activities
    .filter(
      (a) =>
        a.archived === archived &&
        (!filter || a.status === filter) &&
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
  const counts = (Object.keys(statuses) as Status[]).map((status) => ({
    status,
    count: activities.filter((a) => a.status === status && !a.archived).length,
  }));
  const statusIcons = {
    not_started: Circle,
    in_progress: Play,
    paused: Pause,
    completed: CheckCircle2,
  };
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label={t("Fechar menu")}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <div className="brand brand--sm brand--horizontal">
          <Link
            href="/"
            className="brand-home-link brand-home-symbol"
            aria-label={t("Tubarão-martelo — Visão geral")}
            onNavigate={navigateHome}
          >
            <BrandSymbol size="sm" decorative />
          </Link>
          <Link
            href="/"
            className="brand-home-link brand-home-wordmark"
            aria-label={t("TASKNADO — Visão geral")}
            onNavigate={navigateHome}
          >
            <BrandWordmark size="sm" decorative />
          </Link>
        </div>
        <button className="sidebar-search" onClick={() => navigate("search")}>
          <Search size={17} />
          <span>{t("Buscar em tudo")}</span>
          <kbd>{t("Ctrl K")}</kbd>
        </button>
        <div className="sidebar-label">{t("MEU ESPAÇO")}</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={
                "nav-item " + (!isProfile && view === id ? "active" : "")
              }
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {id === "activities" && (
                <span className="nav-count">
                  {number(activities.filter((a) => !a.archived).length)}
                  {hasMore ? "+" : ""}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-label row between">
          <span>{t("WORKSPACES")}</span>
          <button
            className="icon-button"
            aria-label={t("Criar workspace")}
            onClick={() => setEditor({ kind: "workspace" })}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="workspace-list">
          {workspaces
            .filter((w) => !w.archived)
            .map((w) => {
              const Icon = icons[w.icon] || Folder;
              return (
                <button
                  className={
                    "nav-item workspace-item " +
                    (w.id === workspaceId ? "selected" : "")
                  }
                  key={w.id}
                  onClick={() => switchWorkspace(w.id)}
                >
                  <Icon size={17} />
                  <span>{w.name}</span>
                  {w.id === workspaceId && (
                    <span className="workspace-indicator" />
                  )}
                </button>
              );
            })}
          {!workspaces.length && (
            <button
              className="nav-item"
              onClick={() => setEditor({ kind: "workspace" })}
            >
              <Plus size={17} /> {t("Seu primeiro workspace")}
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="private-card">
            <LockKeyhole size={17} />
            <div>
              <strong>{t("Um espaço só seu")}</strong>
              <p>{t("Privado. Organizado. No seu ritmo.")}</p>
            </div>
          </div>
          <button
            className={
              "nav-item " + (!isProfile && view === "settings" ? "active" : "")
            }
            onClick={() => navigate("settings")}
          >
            <Settings size={18} /> {t("Configurações")}
          </button>
          <div className="profile">
            <span className="avatar">{user.email?.[0].toUpperCase()}</span>
            <div>
              <strong>{t("Minha conta")}</strong>
              <small>{user.email}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t("Sair")}
              onClick={async () => {
                if (canLeave())
                  try {
                    check(await client().auth.signOut());
                  } catch (e) {
                    report(errorMessage(e));
                  }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button mobile-menu"
              aria-label={t("Abrir menu")}
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="muted">{t("Meu espaço")}</span>
            <ChevronRight size={14} />
            <button
              className="workspace-crumb"
              onClick={() => navigate("settings")}
            >
              {workspace?.name || t("Bem-vindo")}
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="row">
            <span className="private-label">
              <LockKeyhole size={13} /> {t("Pessoal e privado")}
            </span>
            <ProfileMenu
              user={user}
              canNavigate={() => {
                if (!canLeave()) return false;
                setMenu(false);
                return true;
              }}
            />
          </div>
        </header>
        <main className="main-content" id="main">
          {isProfile ? (
            <Profile user={user} />
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
                        {w.archived ? "· Arquivado" : ""}
                      </p>
                    </div>
                    <div className="row">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          switchWorkspace(w.id);
                          navigate("dashboard");
                        }}
                      >
                        {t("Abrir")}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setEditor({ kind: "workspace", item: w })
                        }
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
          ) : !workspace ? (
            <div className="welcome panel">
              <span className="eyebrow">
                {t("BEM-VINDO AO SEU NOVO ESPAÇO")}
              </span>
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
              category={workspace.category}
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
                      : workspace.name.toUpperCase()}
                  </span>
                  <h1>
                    {view === "dashboard"
                      ? t("Seu dia, com mais clareza.")
                      : t("Atividades")}
                  </h1>
                  <p>
                    {view === "dashboard"
                      ? t(
                          "Tudo o que você precisa para continuar de onde parou.",
                        )
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
                            setFilter(status);
                            setView("activities");
                            setArchived(false);
                          }}
                        >
                          <div className="row between">
                            <span>{t(statuses[status])}</span>
                            <Icon size={18} />
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
                  <section className="resume-banner">
                    <div className="resume-icon">
                      <HistoryIcon />
                    </div>
                    <div>
                      <h3>
                        {t("Seu próximo passo já tem um ponto de partida.")}
                      </h3>
                      <p>
                        {activities.some((a) => a.status === "paused")
                          ? t(
                              "Retome uma atividade pausada e encontre o contexto no histórico.",
                            )
                          : t(
                              "Registre o que fez hoje. Amanhã, o contexto estará aqui.",
                            )}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setFilter("paused");
                        setView("activities");
                      }}
                    >
                      {t("Ver pausadas")} <ArrowUpRight size={15} />
                    </Button>
                  </section>
                </>
              )}
              {workspace.category === "work" && (
                <PriorityMatrix
                  activities={activities}
                  onOpen={(id) => {
                    setActivityId(id);
                    setView("activities");
                  }}
                  onChange={loadContent}
                  report={report}
                />
              )}
              <section className="panel activities-panel">
                <div className="section-heading">
                  <div className="row">
                    <h2>
                      {view === "dashboard"
                        ? t("Atividades recentes")
                        : t("Todas as atividades")}
                    </h2>
                    <span className="count">{number(shown.length)}</span>
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
                <div className="list-toolbar">
                  <div className="filter-tabs">
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
                      {workspace.category === "work" && (
                        <option value="scheduled">
                          {t("Data programada")}
                        </option>
                      )}
                    </select>
                  </div>
                </div>
                {workspace.category === "university" && (
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
                {workspace.category === "work" && (
                  <div className="list-toolbar category-filters">
                    <label>
                      {t("Agendamento")}
                      <select
                        value={scheduleFilter}
                        onChange={(e) => setScheduleFilter(e.target.value)}
                      >
                        <option value="">{t("Todas")}</option>
                        <option value="yes">{t("Com data programada")}</option>
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
                <div className="activity-table">
                  <div className="table-head">
                    <span>{t("ATIVIDADE")}</span>
                    <span>{t("STATUS")}</span>
                    <span>{t("ATUALIZADA EM")}</span>
                    <span />
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
                            setView("activities");
                          }}
                        >
                          <div className="activity-title">
                            <span className="activity-symbol">
                              <Icon size={17} />
                            </span>
                            <div>
                              <strong>{a.title}</strong>
                              {workspace.category === "work" && (
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
                          <time>{date(a.updated_at)}</time>
                          <ChevronRight size={16} />
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
                      : t("taskCount", {
                          count: shown.length,
                          workspace: workspace.name,
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
              <div className="bottom-grid">
                <button
                  className="panel shortcut-card"
                  onClick={() => navigate("notes")}
                >
                  <NotebookPen size={23} />
                  <div>
                    <h3>{t("Uma ideia que vale guardar?")}</h3>
                    <p>
                      {t("Abra seu bloco de notas. O salvamento é automático.")}
                    </p>
                  </div>
                  <ArrowUpRight size={20} />
                </button>
                <button
                  className="panel shortcut-card"
                  onClick={() => navigate("search")}
                >
                  <Search size={23} />
                  <div>
                    <h3>{t("O contexto está por aqui.")}</h3>
                    <p>{t("Encontre notas, acontecimentos e arquivos.")}</p>
                  </div>
                  <kbd>{t("Ctrl K")}</kbd>
                </button>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>{t("Tasknado · Sua memória operacional")}</span>
          <span>{t("Um passo de cada vez.")}</span>
        </footer>
      </div>
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
            {editor.kind === "activity" && workspace && (
              <CategoryFields
                category={workspace.category}
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
    </div>
  );
}
function HistoryIcon() {
  return <ListTodo size={25} />;
}
