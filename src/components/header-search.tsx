"use client";
import { useSearch } from "@/hooks/use-search";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { client, check, errorMessage } from "@/lib/supabase";
import { SearchResult, Workspace } from "@/lib/domain";

/** Keep in sync with the 1279px rule for .header-search in shell.css. */
const collapsedSearchQuery = "(max-width: 1279px)";
export const searchKinds: Record<string, string> = {
  workspace: "Workspace",
  activity: "Atividade",
  event: "Observações e acontecimentos",
  workspace_observation: "Observações gerais",
  note: "Nota",
  entry: "Entrada",
  file: "Arquivo",
};
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return (
    <>
      {text
        .split(re)
        .map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}
    </>
  );
}
/**
 * Global search in the top bar. On narrower bars the field rests as an icon
 * and opens over the bar when it receives focus (see shell.css); the input is
 * always in the document, so Ctrl/⌘ K and the Tab key reach it either way.
 */
export function HeaderSearch({
  workspaces,
  onOpen,
  guard,
}: {
  workspaces: Workspace[];
  onOpen: (r: SearchResult) => void;
  /** Refuses to leave the page while it holds unsaved changes. */
  guard: (event: { preventDefault: () => void }) => void;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(-1);
  const list = useSearch(query, {}, open);
  const results = query.trim() ? (list.data ?? []) : [],
    loading = list.isFetching,
    error = list.error ? errorMessage(list.error) : "";
  const rows = Object.keys(searchKinds).flatMap((kind) =>
    results.filter((r) => r.kind === kind),
  );
  function close(restore = false) {
    setOpen(false);
    setActive(-1);
    if (!restore) return;
    const previous = returnFocus.current;
    returnFocus.current = null;
    if (previous && previous !== document.body && previous !== input.current)
      previous.focus();
    // Where the field rests as an icon, leaving it lets it fold back.
    else if (window.matchMedia(collapsedSearchQuery).matches)
      input.current?.blur();
    else input.current?.focus();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        returnFocus.current = document.activeElement as HTMLElement;
        input.current?.focus();
        setOpen(true);
      }
      if (
        e.key === "Escape" &&
        root.current?.contains(document.activeElement)
      ) {
        e.preventDefault();
        close(true);
      }
    };
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  useEffect(() => setActive(-1), [query]);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`global-result-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  // After leaving through a result or the link, the resting icon comes back.
  function fold() {
    if (
      window.matchMedia(collapsedSearchQuery).matches &&
      document.activeElement instanceof HTMLElement &&
      root.current?.contains(document.activeElement)
    )
      document.activeElement.blur();
  }
  function choose(r: SearchResult) {
    close();
    fold();
    onOpen(r);
  }
  return (
    <div
      className="header-search"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <div
        className="header-search-field"
        // The resting icon is the whole target: a press anywhere on the
        // field puts the caret in the input.
        onMouseDown={(e) => {
          if (
            e.target !== input.current &&
            !(e.target as Element).closest("button")
          ) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
      >
        <Search size={17} aria-hidden="true" />
        <input
          id="global-search"
          ref={input}
          role="combobox"
          aria-label={t("Busca global")}
          aria-expanded={open}
          aria-controls="global-results"
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `global-result-${active}` : undefined
          }
          placeholder={t("Buscar em tudo")}
          value={query}
          maxLength={200}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((n) =>
                rows.length
                  ? (n + (e.key === "ArrowDown" ? 1 : -1) + rows.length) %
                    rows.length
                  : -1,
              );
            }
            if (e.key === "Enter" && rows[active]) {
              e.preventDefault();
              choose(rows[active]);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              close(true);
            }
          }}
        />
        {query ? (
          <button
            aria-label={t("Limpar pesquisa")}
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd>{t("Ctrl / ⌘ K")}</kbd>
        )}
      </div>
      {open && (
        <div className="search-popover">
          <div role="status" className="search-status">
            {t(
              loading
                ? "Pesquisando…"
                : error
                  ? error
                  : query.trim()
                    ? rows.length
                      ? "Resultados"
                      : "Nenhum resultado encontrado"
                    : "Digite uma palavra ou expressão para começar.",
            )}
            {error && (
              <button
                className="text-button"
                onClick={() => void list.refetch()}
              >
                {t("Tentar novamente")}
              </button>
            )}
          </div>
          <div
            id="global-results"
            role="listbox"
            aria-label={t("Resultados da pesquisa")}
          >
            {Object.entries(searchKinds).map(([kind, label]) => {
              const group = rows.filter((r) => r.kind === kind);
              return group.length ? (
                <div role="group" aria-label={t(label)} key={kind}>
                  <div className="result-group">{t(label)}</div>
                  {group.map((r) => {
                    const index = rows.indexOf(r);
                    return (
                      <button
                        key={r.id}
                        id={`global-result-${index}`}
                        role="option"
                        tabIndex={-1}
                        aria-selected={active === index}
                        className="quick-result"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(r)}
                      >
                        <strong>
                          <Highlight text={r.title} query={query} />
                        </strong>
                        <small>
                          {
                            workspaces.find((w) => w.id === r.workspace_id)
                              ?.name
                          }
                        </small>
                        <p>
                          <Highlight text={r.excerpt} query={query} />
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : null;
            })}
          </div>
          <Link
            href="/search"
            className="search-advanced"
            onNavigate={(event) => {
              let refused = false;
              guard({
                preventDefault() {
                  refused = true;
                  event.preventDefault();
                },
              });
              if (!refused) {
                close();
                fold();
              }
            }}
          >
            {t("Pesquisa avançada")}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
