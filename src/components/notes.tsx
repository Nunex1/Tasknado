"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  NotebookPen,
  Check,
  Cloud,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { Entry, Note, date } from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Files } from "./files";
export function NoteEntry({
  entry,
  onDirty,
  report,
}: {
  entry: Entry;
  onDirty: (id: string, dirty: boolean) => void;
  report: (s: string) => void;
}) {
  const [content, setContent] = useState(entry.content),
    [saved, setSaved] = useState(entry.content),
    [revision, setRevision] = useState(entry.revision),
    [status, setStatus] = useState("Salvo"),
    [retry, setRetry] = useState(0);
  const saving = useRef(false),
    latest = useRef(content);
  latest.current = content;
  useEffect(() => {
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
        setStatus("Erro ao salvar");
        report(errorMessage(e));
      } finally {
        saving.current = false;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [content, saved, revision, retry]);
  return (
    <article className="note-entry">
      <div className="row between">
        <time>{date(entry.created_at)}</time>
        <span
          className={
            "save-status " + (status === "Erro ao salvar" ? "error" : "")
          }
          role="status"
        >
          {status === "Salvo" ? <Check size={14} /> : <Cloud size={14} />}{" "}
          {status}
        </span>
      </div>
      <textarea
        aria-label={"Entrada de " + date(entry.created_at)}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          onDirty(entry.id, e.target.value !== saved);
        }}
        maxLength={50000}
        placeholder="Escreva uma ideia, um aprendizado ou um próximo passo…"
        rows={7}
      />
      {status === "Erro ao salvar" && (
        <div className="row">
          <Button variant="secondary" onClick={() => setRetry((x) => x + 1)}>
            <RefreshCw size={14} /> Tentar novamente
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (
                !confirm(
                  "Copie seu texto antes de continuar. Carregar a versão atual substituirá o texto desta entrada.",
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
            Carregar versão atual
          </Button>
          <small>
            Texto preservado nesta tela. Copie-o antes de recarregar.
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
export function Notes({
  notes,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDirty,
  report,
}: {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (note: Note) => void;
  onDirty: (id: string, dirty: boolean) => void;
  report: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [order, setOrder] = useState("updated_at"),
    [entries, setEntries] = useState<Entry[]>([]),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [loadedCount, setLoadedCount] = useState(0);
  const selected = notes.find((n) => n.id === selectedId);
  const activeId = useRef(selectedId);
  activeId.current = selectedId;
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
    setEntries((prev) => {
      const merged = offset ? [...prev, ...result] : result;
      return [
        ...new Map(merged.map((entry) => [entry.id, entry])).values(),
      ].sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      );
    });
    setLoadedCount(offset + result.length);
    setMore(result.length === 50);
  }
  useEffect(() => {
    setEntries([]);
    void load().catch((e) => report(errorMessage(e)));
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
  const filtered = notes
    .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      order === "title"
        ? a.title.localeCompare(b.title)
        : b[order as "created_at" | "updated_at"].localeCompare(
            a[order as "created_at" | "updated_at"],
          ),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONHECIMENTO SEM PONTAS SOLTAS</span>
          <h1>Bloco de notas</h1>
          <p>Um lugar para suas ideias, referências e descobertas.</p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={17} /> Nova nota
        </Button>
      </div>
      <div className="notes-layout">
        <section className="panel notes-list">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Pesquisar notas"
              placeholder="Pesquisar títulos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Ordenar notas"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="updated_at">Última atualização</option>
            <option value="created_at">Criação</option>
            <option value="title">Nome</option>
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
            <p className="empty-inline">Nenhuma nota encontrada.</p>
          )}
        </section>
        <section className="panel note-content">
          {selected ? (
            <>
              <div className="section-heading">
                <h2>{selected.title}</h2>
                <Button
                  variant="ghost"
                  onClick={() => onRename(selected)}
                  aria-label="Renomear nota"
                >
                  <Pencil size={17} />
                </Button>
              </div>
              <div className="note-entries">
                {entries.map((entry) => (
                  <NoteEntry
                    key={entry.id}
                    entry={entry}
                    onDirty={onDirty}
                    report={report}
                  />
                ))}
                {!entries.length && (
                  <div className="empty">
                    <NotebookPen />
                    <h3>Espaço para uma nova ideia</h3>
                    <p>
                      Adicione uma entrada. Seu texto será salvo
                      automaticamente.
                    </p>
                  </div>
                )}
                {more && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void load(loadedCount).catch((e) =>
                        report(errorMessage(e)),
                      )
                    }
                  >
                    Carregar próximas entradas
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => void add()}
                  disabled={busy}
                >
                  <Plus size={16} /> Adicionar entrada
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
              <h3>Seu conhecimento, bem guardado</h3>
              <p>Selecione uma nota ou crie um novo tema.</p>
              <Button onClick={onCreate}>
                <Plus size={16} /> Criar nota
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
