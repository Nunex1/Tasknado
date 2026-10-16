"use client";
import { useEffect, useState } from "react";
import { Search as SearchIcon, ArrowUpRight } from "lucide-react";
import {
  SearchResult,
  Workspace,
  statuses,
  date,
  mimeTypes,
} from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";
export function GlobalSearch({
  workspaces,
  onOpen,
  report,
}: {
  workspaces: Workspace[];
  onOpen: (r: SearchResult) => void;
  report: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [kind, setKind] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [mime, setMime] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]),
    [loading, setLoading] = useState(false),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [query, workspace, kind, status, from, to, mime]);
  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = check(
          await client().rpc("search_all", {
            p_query: query,
            p_workspace: workspace || null,
            p_kind: kind || null,
            p_status: status || null,
            p_from: from ? new Date(from + "T00:00:00").toISOString() : null,
            p_to: to ? new Date(to + "T23:59:59.999").toISOString() : null,
            p_mime: mime || null,
            p_offset: offset,
          }),
        ) as SearchResult[];
        if (active) {
          setResults(data);
          setMore(data.length === 50);
        }
      } catch (e) {
        if (active) report(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, workspace, kind, status, from, to, mime, offset]);
  const kinds: Record<string, string> = {
    workspace: "Workspace",
    activity: "Atividade",
    event: "Acontecimento",
    note: "Nota",
    entry: "Entrada",
    file: "Arquivo",
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ENCONTRE O CONTEXTO</span>
          <h1>Busca global</h1>
          <p>
            Pesquise em todos os seus workspaces, incluindo itens arquivados.
          </p>
        </div>
      </div>
      <section className="panel search-panel">
        <label className="search-input large">
          <SearchIcon size={22} />
          <input
            autoFocus
            placeholder="O que você quer encontrar?"
            aria-label="Busca global"
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="search-filters">
          <label>
            Workspace
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            >
              <option value="">Todos</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Conteúdo
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Todos os tipos</option>
              {Object.entries(kinds).map(([key, name]) => (
                <option value={key} key={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(statuses).map(([key, name]) => (
                <option value={key} key={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Formato
            <select value={mime} onChange={(e) => setMime(e.target.value)}>
              <option value="">Todos</option>
              {mimeTypes.map((m) => (
                <option value={m} key={m}>
                  {m
                    .split("/")[1]
                    .replace("vnd.openxmlformats-officedocument.", "")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <p className="muted" role="status">
        {loading
          ? "Pesquisando…"
          : query
            ? `${results.length} resultado(s) nesta página`
            : "Digite uma palavra ou expressão para começar."}
      </p>
      <section className="search-results">
        {results.map((r) => (
          <button
            className="panel search-result"
            key={r.kind + r.id}
            onClick={() => onOpen(r)}
          >
            <div>
              <span className="eyebrow">
                {kinds[r.kind]} ·{" "}
                {workspaces.find((w) => w.id === r.workspace_id)?.name}
              </span>
              <h3>{r.title}</h3>
              <p>{r.excerpt}</p>
              <small>{date(r.created_at)}</small>
            </div>
            <ArrowUpRight size={19} />
          </button>
        ))}
        {query && !loading && !results.length && (
          <div className="empty">
            <SearchIcon />
            <h3>Nenhum resultado encontrado</h3>
            <p>Tente outra palavra ou ajuste os filtros.</p>
          </div>
        )}
      </section>
      <div className="row">
        {offset > 0 && (
          <Button
            variant="secondary"
            onClick={() => setOffset((x) => Math.max(0, x - 50))}
          >
            Anterior
          </Button>
        )}
        {more && (
          <Button variant="secondary" onClick={() => setOffset((x) => x + 50)}>
            Próxima página
          </Button>
        )}
      </div>
    </>
  );
}
