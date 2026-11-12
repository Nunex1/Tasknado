"use client";
import { useI18n } from "@/i18n/provider";
import { useEffect, useId, useRef, useState } from "react";
import {
  Plus,
  Search,
  NotebookPen,
  Check,
  Cloud,
  RefreshCw,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { Entry, Note } from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { isGone, mergeEntries, nextNoteId, removeEntry } from "@/lib/notes";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/dialog";
import { Files } from "./files";
export function NoteEntry({
  entry,
  deleting,
  onDelete,
  onDirty,
  report,
}: {
  entry: Entry;
  deleting: boolean;
  onDelete: (entry: Entry, opener: HTMLElement) => void;
  onDirty: (id: string, dirty: boolean) => void;
  report: (s: string) => void;
}) {
  const { t, date } = useI18n();
  const [content, setContent] = useState(entry.content),
    [saved, setSaved] = useState(entry.content),
    [revision, setRevision] = useState(entry.revision),
    [status, setStatus] = useState("Salvo"),
    [retry, setRetry] = useState(0);
  const saving = useRef(false),
    latest = useRef(content),
    removing = useRef(deleting);
  latest.current = content;
  removing.current = deleting;
  useEffect(() => {
    // While a deletion runs nothing is scheduled; the previous cleanup already
    // cancelled the pending save. If the deletion fails, this runs again.
    if (deleting) return;
    onDirty(entry.id, content !== saved);
    if (content === saved) return;
    setStatus("Aguardando…");
    const timer = setTimeout(async () => {
      if (saving.current) return;
      saving.current = true;
      setStatus("Salvando…");
      try {
        const next = check(
          await client().rpc("save_entry", {
            p_id: entry.id,
            p_content: content,
            p_revision: revision,
          }),
        ) as Entry;
        setRevision(next.revision);
        setSaved(content);
        setStatus(latest.current === content ? "Salvo" : "Aguardando…");
      } catch (e) {
        // A save that loses the race against a deletion is expected.
        if (removing.current) return;
        setStatus("Erro ao salvar");
        report(errorMessage(e));
      } finally {
        saving.current = false;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [content, saved, revision, retry, deleting]);
  return (
    <article
      className={"note-entry" + (deleting ? " deleting" : "")}
      aria-busy={deleting}
    >
      <div className="row between">
        <time>{date(entry.created_at)}</time>
        <div className="row note-entry-meta">
          <span
            className={
              "save-status " + (status === "Erro ao salvar" ? "error" : "")
            }
            role="status"
          >
            {status === "Salvo" ? <Check size={14} /> : <Cloud size={14} />}{" "}
            {t(status)}
          </span>
          <button
            type="button"
            className="icon-button note-entry-delete"
            aria-label={t("Excluir bloco")}
            title={t("Excluir bloco")}
            disabled={deleting}
            onClick={(e) => onDelete(entry, e.currentTarget)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <textarea
        aria-label={t("Entrada de {{date}}", { date: date(entry.created_at) })}
        value={content}
        readOnly={deleting}
        onChange={(e) => {
          setContent(e.target.value);
          onDirty(entry.id, e.target.value !== saved);
        }}
        maxLength={50000}
        placeholder={t(
          "Escreva uma ideia, um aprendizado ou um próximo passo…",
        )}
        rows={7}
      />
      {status === "Erro ao salvar" && (
        <div className="row">
          <Button variant="secondary" onClick={() => setRetry((x) => x + 1)}>
            <RefreshCw size={14} /> {t("Tentar novamente")}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (
                !confirm(
                  t(
                    "Copie seu texto antes de continuar. Carregar a versão atual substituirá o texto desta entrada.",
                  ),
                )
              )
                return;
              try {
                const current = check(
                  await client()
                    .from("note_entries")
                    .select("*")
                    .eq("id", entry.id)
                    .single(),
                ) as Entry;
                setContent(current.content);
                setSaved(current.content);
                setRevision(current.revision);
                setStatus("Salvo");
                onDirty(entry.id, false);
              } catch (e) {
                report(errorMessage(e));
              }
            }}
          >
            {t("Carregar versão atual")}
          </Button>
          <small>
            {t("Texto preservado nesta tela. Copie-o antes de recarregar.")}
          </small>
        </div>
      )}
      {content === saved &&
        content.match(/https?:\/\/[^\s]+/g)?.map((url, i) => (
          <a
            className="note-link"
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {url}
          </a>
        ))}
    </article>
  );
}
function NoteMenu({
  triggerRef,
  onEdit,
  onDelete,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const actions = [
    { label: t("Editar nota"), icon: Pencil, run: onEdit, danger: false },
    { label: t("Excluir nota"), icon: Trash2, run: onDelete, danger: true },
  ];
  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function focusItem(index: number) {
    items.current[(index + actions.length) % actions.length]?.focus();
  }
  return (
    <div className="note-menu" ref={container}>
      <button
        ref={triggerRef}
        type="button"
        className="button ghost"
        aria-label={t("Ações da nota")}
        title={t("Ações da nota")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("Ações da nota")}
          className="profile-dropdown"
          onKeyDown={(event) => {
            const current = items.current.findIndex(
              (item) => item === document.activeElement,
            );
            if (event.key === "ArrowDown") focusItem(current + 1);
            else if (event.key === "ArrowUp") focusItem(current - 1);
            else if (event.key === "Home") focusItem(0);
            else if (event.key === "End") focusItem(actions.length - 1);
            else if (event.key === "Escape" || event.key === "Tab") {
              // Tab resumes the normal order from the menu button.
              setOpen(false);
              triggerRef.current?.focus();
              if (event.key === "Tab") return;
            } else return;
            event.preventDefault();
          }}
        >
          {actions.map((action, index) => (
            <button
              key={index}
              ref={(element) => {
                items.current[index] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={"profile-menu-item" + (action.danger ? " danger" : "")}
              onClick={() => {
                setOpen(false);
                action.run();
              }}
            >
              <action.icon size={16} aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
type DeleteTarget =
  { kind: "entry"; entry: Entry } | { kind: "note"; note: Note };
export function Notes({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDirty,
  report,
}: {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (note: Note) => void;
  onDelete: (note: Note, nextId: string | null) => Promise<void>;
  onDirty: (id: string, dirty: boolean) => void;
  report: (s: string) => void;
}) {
  const { t, date, locale } = useI18n();
  const [query, setQuery] = useState(""),
    [order, setOrder] = useState("updated_at"),
    [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [loadedCount, setLoadedCount] = useState(0),
    [target, setTarget] = useState<DeleteTarget | null>(null),
    [deleting, setDeleting] = useState(false);
  const selected = notes.find((n) => n.id === selectedId);
  const activeId = useRef(selectedId);
  activeId.current = selectedId;
  const shown = useRef(entries);
  shown.current = entries;
  const deleteLock = useRef(false),
    removed = useRef(new Set<string>()),
    pending = useRef<Promise<void> | null>(null),
    opener = useRef<HTMLElement | null>(null),
    heading = useRef<HTMLHeadingElement>(null),
    menuTrigger = useRef<HTMLButtonElement>(null);
  async function load(offset = 0) {
    if (!selectedId) {
      setEntries([]);
      return;
    }
    const result = check(
      await client()
        .from("note_entries")
        .select("*")
        .eq("note_id", selectedId)
        .order("created_at")
        .order("id")
        .range(offset, offset + 49),
    ) as Entry[];
    if (activeId.current !== selectedId) return;
    setEntries((prev) =>
      mergeEntries(prev, result, offset > 0, removed.current),
    );
    setLoadedCount(offset + result.length);
    setMore(result.length === 50);
  }
  function startLoad(offset = 0) {
    pending.current = load(offset).catch((e) => report(errorMessage(e)));
  }
  useEffect(() => {
    setEntries([]);
    // A confirmation left open belongs to the note that was on screen.
    if (!deleteLock.current) setTarget(null);
    startLoad();
  }, [selectedId]);
  async function add() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const entry = check(
        await client()
          .from("note_entries")
          .insert({ note_id: selectedId })
          .select()
          .single(),
      ) as Entry;
      if (activeId.current === selectedId)
        setEntries((prev) => [...prev, entry]);
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    // The ref closes the gap between two clicks and the next render.
    if (!target || deleteLock.current) return;
    deleteLock.current = true;
    setDeleting(true);
    try {
      // Let a page that is still loading settle, so offsets and content
      // describe a single state.
      await pending.current;
      if (target.kind === "entry") {
        const { entry } = target;
        let gone = false;
        try {
          await removeEntry(client(), entry);
        } catch (e) {
          if (!isGone(e)) throw e;
          gone = true;
        }
        removed.current.add(entry.id);
        onDirty(entry.id, false);
        if (activeId.current === entry.note_id) {
          setEntries((prev) => prev.filter((item) => item.id !== entry.id));
          setLoadedCount((count) => Math.max(0, count - 1));
        }
        opener.current = heading.current;
        report(
          gone ? "Este bloco não está mais disponível." : "Bloco excluído.",
        );
      } else {
        const { note } = target;
        await onDelete(note, nextNoteId(filtered, note.id));
        for (const entry of shown.current) {
          removed.current.add(entry.id);
          onDirty(entry.id, false);
        }
        setEntries([]);
        opener.current = document.getElementById("main");
      }
    } catch (e) {
      report(errorMessage(e));
    } finally {
      deleteLock.current = false;
      setDeleting(false);
      setTarget(null);
    }
  }
  const filtered = notes
    .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      order === "title"
        ? a.title.localeCompare(b.title, locale)
        : b[order as "created_at" | "updated_at"].localeCompare(
            a[order as "created_at" | "updated_at"],
          ),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("CONHECIMENTO SEM PONTAS SOLTAS")}</span>
          <h1>{t("Bloco de notas")}</h1>
          <p>{t("Um lugar para suas ideias, referências e descobertas.")}</p>
        </div>
        <Button className="heading-action" onClick={onCreate}>
          <Plus size={17} /> {t("Nova nota")}
        </Button>
      </div>
      <div className="notes-layout">
        <section className="panel notes-list">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label={t("Pesquisar notas")}
              placeholder={t("Pesquisar títulos…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label={t("Ordenar notas")}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="updated_at">{t("Última atualização")}</option>
            <option value="created_at">{t("Criação")}</option>
            <option value="title">{t("Nome")}</option>
          </select>
          {filtered.map((note) => (
            <button
              key={note.id}
              onClick={() => onSelect(note.id)}
              className={
                "note-list-item " + (selectedId === note.id ? "active" : "")
              }
            >
              <NotebookPen size={18} />
              <span>
                <strong>{note.title}</strong>
                <small>{date(note.updated_at)}</small>
              </span>
            </button>
          ))}
          {!filtered.length && (
            <p className="empty-inline">{t("Nenhuma nota encontrada.")}</p>
          )}
        </section>
        <section className="panel note-content">
          {selected ? (
            <>
              <div className="section-heading note-heading">
                <h2 ref={heading} tabIndex={0} title={selected.title}>
                  {selected.title}
                </h2>
                <div className="note-actions">
                  <Button
                    variant="ghost"
                    onClick={() => onRename(selected)}
                    aria-label={t("Renomear nota")}
                  >
                    <Pencil size={17} />
                  </Button>
                  <NoteMenu
                    triggerRef={menuTrigger}
                    onEdit={() => onRename(selected)}
                    onDelete={() => {
                      opener.current = menuTrigger.current;
                      setTarget({ kind: "note", note: selected });
                    }}
                  />
                </div>
              </div>
              <div className="note-entries">
                {entries.map((entry) => (
                  <NoteEntry
                    key={entry.id}
                    entry={entry}
                    deleting={
                      deleting &&
                      !!target &&
                      (target.kind === "note" || target.entry.id === entry.id)
                    }
                    onDelete={(item, element) => {
                      opener.current = element;
                      setTarget({ kind: "entry", entry: item });
                    }}
                    onDirty={onDirty}
                    report={report}
                  />
                ))}
                {!entries.length && (
                  <div className="empty">
                    <NotebookPen />
                    <h3>{t("Espaço para uma nova ideia")}</h3>
                    <p>
                      {t(
                        "Adicione uma entrada. Seu texto será salvo automaticamente.",
                      )}
                    </p>
                  </div>
                )}
                {more && (
                  <Button
                    variant="ghost"
                    onClick={() => startLoad(loadedCount)}
                  >
                    {t("Carregar próximas entradas")}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void add()}
                  disabled={busy}
                >
                  <Plus size={16} /> {t("Adicionar entrada")}
                </Button>
              </div>
              <Files
                key={selected.id}
                id={selected.id}
                kind="note"
                report={report}
              />
            </>
          ) : (
            <div className="empty tall">
              <NotebookPen />
              <h3>{t("Seu conhecimento, bem guardado")}</h3>
              <p>{t("Selecione uma nota ou crie um novo tema.")}</p>
              <Button onClick={onCreate}>
                <Plus size={16} /> {t("Criar nota")}
              </Button>
            </div>
          )}
        </section>
      </div>
      {target && (
        <ConfirmDialog
          title={
            target.kind === "entry"
              ? t("Excluir este bloco?")
              : t("Excluir “{{title}}”?", { title: target.note.title })
          }
          description={
            target.kind === "entry"
              ? t(
                  "Esta ação removerá permanentemente o bloco selecionado. O restante da nota permanecerá inalterado.",
                )
              : t(
                  "Esta ação excluirá permanentemente esta nota, todos os seus blocos e arquivos anexados.",
                )
          }
          confirmLabel={
            target.kind === "entry" ? t("Excluir") : t("Excluir nota")
          }
          busy={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setTarget(null)}
          returnFocusRef={opener}
        />
      )}
    </>
  );
}
