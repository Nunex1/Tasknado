"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  Activity,
  Note,
  SearchResult,
  Status,
  statuses,
  date,
} from "@/lib/domain";
import { Auth } from "./auth";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { ActivityDetail } from "./activity-detail";
import { Notes } from "./notes";
import { GlobalSearch } from "./search";
import { BrandLogo } from "./brand";
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
  const dirty = useRef(new Set<string>());
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
        client()
          .from("activities")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("updated_at", { ascending: false })
          .limit(limit),
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
        setHasMore(aa.length === limit);
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
        }
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", key);
    };
  }, []);
  function navigate(next: View) {
    if (!canLeave()) return;
    setView(next);
    setActivityId(null);
    setMenu(false);
  }
  function switchWorkspace(id: string) {
    if (!canLeave()) return;
    setWorkspaceId(id);
    setActivities([]);
    setNotes([]);
    setActivityId(null);
    setNoteId(null);
    setLimit(50);
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
        if (editor.item)
          check(
            await client()
              .from("activities")
              .update({ title, description })
              .eq("id", editor.item.id),
          );
        else {
          const row = check(
            await client()
              .from("activities")
              .insert({ title, description, workspace_id: workspaceId })
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
        `Esta ação exclui atividades, notas e arquivos. Digite o nome do workspace para confirmar: ${w.name}`,
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
        "Esta ação exclui permanentemente sua conta e registros. Digite seu e-mail para confirmar:",
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
        `${a.title} ${a.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : b[sort as "created_at" | "updated_at"].localeCompare(
            a[sort as "created_at" | "updated_at"],
          ),
    );
  if (!db) return <Auth onRecovered={() => setRecovery(false)} />;
  if (!ready)
    return (
      <main className="setup" role="status">
        <BrandLogo layout="vertical" />
        <p>Abrindo seu espaço…</p>
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
    { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
    { id: "activities", label: "Atividades", icon: ListTodo },
    { id: "notes", label: "Bloco de notas", icon: NotebookPen },
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
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <BrandLogo size="sm" />
        <button className="sidebar-search" onClick={() => navigate("search")}>
          <Search size={17} />
          <span>Buscar em tudo</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="sidebar-label">MEU ESPAÇO</div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              className={"nav-item " + (view === id ? "active" : "")}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {id === "activities" && (
                <span className="nav-count">
                  {activities.filter((a) => !a.archived).length}
                  {hasMore ? "+" : ""}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-label row between">
          <span>WORKSPACES</span>
          <button
            className="icon-button"
            aria-label="Criar workspace"
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
              <Plus size={17} /> Seu primeiro workspace
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="private-card">
            <LockKeyhole size={17} />
            <div>
              <strong>Um espaço só seu</strong>
              <p>Privado. Organizado. No seu ritmo.</p>
            </div>
          </div>
          <button
            className={"nav-item " + (view === "settings" ? "active" : "")}
            onClick={() => navigate("settings")}
          >
            <Settings size={18} /> Configurações
          </button>
          <div className="profile">
            <span className="avatar">{user.email?.[0].toUpperCase()}</span>
            <div>
              <strong>Minha conta</strong>
              <small>{user.email}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sair"
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
              aria-label="Abrir menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="muted">Meu espaço</span>
            <ChevronRight size={14} />
            <button
              className="workspace-crumb"
              onClick={() => navigate("settings")}
            >
              {workspace?.name || "Bem-vindo"}
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="row">
            <span className="private-label">
              <LockKeyhole size={13} /> Pessoal e privado
            </span>
            <span className="avatar small-avatar">
              {user.email?.[0].toUpperCase()}
            </span>
          </div>
        </header>
        <main className="main-content" id="main">
          {view === "search" ? (
            <GlobalSearch
              workspaces={workspaces}
              onOpen={(r) => void openResult(r)}
              report={report}
            />
          ) : view === "settings" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">DO SEU JEITO</span>
                  <h1>Configurações</h1>
                  <p>Gerencie seus espaços e seus dados pessoais.</p>
                </div>
                <Button onClick={() => setEditor({ kind: "workspace" })}>
                  <Plus size={16} /> Novo workspace
                </Button>
              </div>
              <section className="panel settings-panel">
                <h2>Seus workspaces</h2>
                {workspaces.map((w) => (
                  <div className="settings-row" key={w.id}>
                    <div>
                      <strong>{w.name}</strong>
                      <p>
                        {w.description || "Sem descrição"}{" "}
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
                        Abrir
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setEditor({ kind: "workspace", item: w })
                        }
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void workspaceArchive(w)}
                      >
                        <Archive size={16} />
                        {w.archived ? "Restaurar" : "Arquivar"}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy}
                        aria-label={"Excluir " + w.name}
                        onClick={() => void deleteWorkspace(w)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
              <section className="panel settings-panel">
                <h2>Conta e privacidade</h2>
                <p>{user.email}</p>
                <p className="muted">
                  Exportação de registros em JSON. Arquivos devem ser baixados
                  individualmente. Para excluir o conteúdo, exclua os workspaces
                  acima.
                </p>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void exportData()}
                >
                  <Download size={16} /> Exportar meus dados
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => void deleteAccount()}
                >
                  Excluir minha conta
                </Button>
                <p className="hint">
                  A exclusão é permanente. Backups seguem a retenção do projeto;
                  arquivos entram na fila de limpeza.
                </p>
              </section>
            </>
          ) : !workspace ? (
            <div className="welcome panel">
              <span className="eyebrow">BEM-VINDO AO SEU NOVO ESPAÇO</span>
              <h1>
                Organização começa
                <br />
                com um lugar para começar.
              </h1>
              <p>
                Crie um workspace para separar seus projetos, estudos ou
                trabalho.
                <br />
                Suas atividades e notas vão morar aqui.
              </p>
              <Button onClick={() => setEditor({ kind: "workspace" })}>
                <Plus size={18} /> Criar meu primeiro workspace
              </Button>
              <div className="welcome-steps">
                <span>01 · Organize por assunto</span>
                <span>02 · Registre cada avanço</span>
                <span>03 · Retome com contexto</span>
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
                  Carregar mais notas
                </Button>
              )}
            </>
          ) : selected && view === "activities" ? (
            <ActivityDetail
              key={selected.id}
              activity={selected}
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
                      ? "CADA AVANÇO CONTA"
                      : workspace.name.toUpperCase()}
                  </span>
                  <h1>
                    {view === "dashboard"
                      ? "Seu dia, com mais clareza."
                      : "Atividades"}
                  </h1>
                  <p>
                    {view === "dashboard"
                      ? "Tudo o que você precisa para continuar de onde parou."
                      : "Acompanhe cada etapa. Preserve todo o contexto."}
                  </p>
                </div>
                <Button onClick={() => setEditor({ kind: "activity" })}>
                  <Plus size={18} /> Nova atividade
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
                            <span>{statuses[status]}</span>
                            <Icon size={18} />
                          </div>
                          <strong>
                            {count}
                            {hasMore ? "+" : ""}
                          </strong>
                          <small>
                            Ver atividades <ArrowUpRight size={13} />
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
                      <h3>Seu próximo passo já tem um ponto de partida.</h3>
                      <p>
                        {activities.some((a) => a.status === "paused")
                          ? "Retome uma atividade pausada e encontre o contexto no histórico."
                          : "Registre o que fez hoje. Amanhã, o contexto estará aqui."}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setFilter("paused");
                        setView("activities");
                      }}
                    >
                      Ver pausadas <ArrowUpRight size={15} />
                    </Button>
                  </section>
                </>
              )}
              <section className="panel activities-panel">
                <div className="section-heading">
                  <div className="row">
                    <h2>
                      {view === "dashboard"
                        ? "Atividades recentes"
                        : "Todas as atividades"}
                    </h2>
                    <span className="count">{shown.length}</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setArchived((x) => !x);
                      setView("activities");
                    }}
                  >
                    <Archive size={15} />
                    {archived ? "Ver ativas" : "Arquivadas"}
                  </button>
                </div>
                <div className="list-toolbar">
                  <div className="filter-tabs">
                    <button
                      className={!filter ? "active" : ""}
                      onClick={() => setFilter("")}
                    >
                      Todas
                    </button>
                    {Object.entries(statuses).map(([s, label]) => (
                      <button
                        className={filter === s ? "active" : ""}
                        key={s}
                        onClick={() => setFilter(s)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    <label className="search-input compact">
                      <Search size={15} />
                      <input
                        aria-label="Filtrar atividades"
                        placeholder="Filtrar…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Ordenar atividades"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="updated_at">Atualização</option>
                      <option value="created_at">Criação</option>
                      <option value="title">Nome</option>
                    </select>
                  </div>
                </div>
                <div className="activity-table">
                  <div className="table-head">
                    <span>ATIVIDADE</span>
                    <span>STATUS</span>
                    <span>ATUALIZADA EM</span>
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
                              <p>
                                {a.description ||
                                  "Seu próximo registro começa aqui."}
                              </p>
                            </div>
                          </div>
                          <span className={"badge " + a.status}>
                            <Icon size={12} />
                            {statuses[a.status]}
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
                        ? "Nenhuma atividade neste filtro"
                        : "Dê espaço ao seu próximo projeto"}
                    </h3>
                    <p>
                      {query || filter
                        ? "Ajuste os filtros para encontrar suas atividades."
                        : "Crie uma atividade e mantenha cada etapa da sua jornada registrada."}
                    </p>
                    {!query && !filter && (
                      <Button
                        variant="secondary"
                        onClick={() => setEditor({ kind: "activity" })}
                      >
                        <Plus size={16} /> Criar atividade
                      </Button>
                    )}
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {loading
                      ? "Atualizando…"
                      : `${shown.length} atividade(s) carregada(s) · ${workspace.name}`}
                  </span>
                  {hasMore ? (
                    <Button
                      variant="ghost"
                      onClick={() => setLimit((x) => x + 50)}
                    >
                      Carregar mais
                    </Button>
                  ) : (
                    <span>
                      <LockKeyhole size={12} /> Visível somente para você
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
                    <h3>Uma ideia que vale guardar?</h3>
                    <p>Abra seu bloco de notas. O salvamento é automático.</p>
                  </div>
                  <ArrowUpRight size={20} />
                </button>
                <button
                  className="panel shortcut-card"
                  onClick={() => navigate("search")}
                >
                  <Search size={23} />
                  <div>
                    <h3>O contexto está por aqui.</h3>
                    <p>Encontre notas, acontecimentos e arquivos.</p>
                  </div>
                  <kbd>Ctrl K</kbd>
                </button>
              </div>
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>Tasknado · Sua memória operacional</span>
          <span>Um passo de cada vez.</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dispensar aviso"
            onClick={() => setToast("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {editor && (
        <Modal
          title={`${editor.item ? "Editar" : "Criar"} ${editor.kind === "workspace" ? "workspace" : editor.kind === "activity" ? "atividade" : "nota"}`}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
          description={
            editor.kind === "workspace"
              ? "Separe seus assuntos em espaços privados."
              : "Dê um nome claro para encontrar este conteúdo depois."
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(new FormData(e.currentTarget));
            }}
          >
            <label>
              {editor.kind === "workspace" ? "Nome" : "Título"}
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
                Descrição
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
            {editor.kind === "workspace" && (
              <label>
                Ícone
                <select
                  name="icon"
                  defaultValue={editor.item?.icon || "folder"}
                >
                  <option value="folder">Pasta</option>
                  <option value="briefcase">Trabalho</option>
                  <option value="book">Estudos</option>
                  <option value="wallet">Finanças</option>
                  <option value="code">Projetos</option>
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
                Cancelar
              </Button>
              <Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
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
