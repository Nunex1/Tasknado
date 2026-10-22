"use client";
import { useI18n } from "@/i18n/provider";
import { useEffect, useState } from "react";
import { Search as SearchIcon, ArrowUpRight } from "lucide-react";
import { SearchResult, Workspace, statuses, mimeTypes } from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";
import { DateInput } from "./ui/date-input";
export function GlobalSearch({
  workspaces,
  onOpen,
  report,
}: {
  workspaces: Workspace[];
  onOpen: (r: SearchResult) => void;
  report: (s: string) => void;
}) {
  const { t, date } = useI18n();
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
    workspace: t("Workspace"),
    activity: t("Atividade"),
    event: t("Acontecimento"),
    note: t("Nota"),
    entry: t("Entrada"),
    file: t("Arquivo"),
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t("ENCONTRE O CONTEXTO")}</span>
          <h1>{t("Busca global")}</h1>
          <p>
            {t(
              "Pesquise em todos os seus workspaces, incluindo itens arquivados.",
            )}
          </p>
        </div>
      </div>
      <section className="panel search-panel">
        <label className="search-input large">
          <SearchIcon size={22} />
          <input
            autoFocus
            placeholder={t("O que você quer encontrar?")}
            aria-label={t("Busca global")}
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="search-filters">
          <label>
            {t("Workspace")}
            <select
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            >
              <option value="">{t("Todos")}</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Conteúdo")}
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">{t("Todos os tipos")}</option>
              {Object.entries(kinds).map(([key, name]) => (
                <option value={key} key={key}>
                  {t(name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Status")}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("Todos")}</option>
              {Object.entries(statuses).map(([key, name]) => (
                <option value={key} key={key}>
                  {t(name)}
                </option>
              ))}
            </select>
          </label>
          <DateInput label={t("De")} value={from} onChange={setFrom} />
          <DateInput label={t("Até")} value={to} onChange={setTo} />
          <label>
            {t("Formato")}
            <select value={mime} onChange={(e) => setMime(e.target.value)}>
              <option value="">{t("Todos")}</option>
              {mimeTypes.map((m) => (
                <option value={m} key={m}>
                  {t(
                    {
                      "text/plain": "Texto simples",
                      "text/csv": "Arquivo CSV",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                        "Documento Word",
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                        "Planilha Excel",
                      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
                        "Apresentação PowerPoint",
                    }[m] || m.split("/")[1].toUpperCase(),
                  )}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <p className="muted" role="status">
        {loading
          ? t("Pesquisando…")
          : query
            ? t("resultCount", { count: results.length })
            : t("Digite uma palavra ou expressão para começar.")}
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
              <p>
                {r.kind === "file" &&
                (r.excerpt === "activity" || r.excerpt === "note")
                  ? kinds[r.excerpt]
                  : r.excerpt}
              </p>
              <small>{date(r.created_at)}</small>
            </div>
            <ArrowUpRight size={19} />
          </button>
        ))}
        {query && !loading && !results.length && (
          <div className="empty">
            <SearchIcon />
            <h3>{t("Nenhum resultado encontrado")}</h3>
            <p>{t("Tente outra palavra ou ajuste os filtros.")}</p>
          </div>
        )}
      </section>
      <div className="row">
        {offset > 0 && (
          <Button
            variant="secondary"
            onClick={() => setOffset((x) => Math.max(0, x - 50))}
          >
            {t("Anterior")}
          </Button>
        )}
        {more && (
          <Button variant="secondary" onClick={() => setOffset((x) => x + 50)}>
            {t("Próxima página")}
          </Button>
        )}
      </div>
    </>
  );
}
