"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useI18n } from "@/i18n/provider";
import { Button } from "./ui/button";

/** Measured rows, stable IDs, focused-row pinning and an explicit paged reading mode. */
export function WindowedList<T extends { id: string }>({
  rows,
  render,
  label,
  estimate = 100,
  mode = "virtual",
  canChange = () => true,
  revealId,
}: {
  rows: T[];
  render: (row: T) => ReactNode;
  label: string;
  estimate?: number;
  mode?: "virtual" | "pages";
  canChange?: () => boolean;
  revealId?: string;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [paged, setPaged] = useState(mode === "pages");
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const large = rows.length > (mode === "pages" ? 50 : 100);
  const focusIndex = rows.findIndex((r) => r.id === focused);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => root.current,
    getItemKey: (i) => rows[i].id,
    estimateSize: () => estimate,
    overscan: 5,
    enabled: large && !paged,
    rangeExtractor: (range) =>
      [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...(focusIndex >= 0 ? [focusIndex] : []),
        ]),
      ].sort((a, b) => a - b),
  });
  useEffect(() => {
    if (!revealId) return;
    const index = rows.findIndex((row) => row.id === revealId);
    if (index >= 0) {
      setPage(Math.floor(index / 50));
      setFocused(revealId);
    }
  }, [revealId]);
  if (!large && mode !== "pages")
    return (
      <>
        {rows.map((row) => (
          <div key={row.id}>{render(row)}</div>
        ))}
      </>
    );
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  function go(next: number) {
    if (!canChange()) return;
    setPage(next);
    root.current?.focus();
    root.current?.scrollTo(0, 0);
  }
  return (
    <>
      {mode !== "pages" && (
        <Button
          variant="ghost"
          onClick={() => {
            if (canChange()) {
              setPaged((p) => !p);
              setPage(Math.max(0, Math.floor(focusIndex / 50)));
            }
          }}
        >
          {t(paged ? "Usar rolagem virtual" : "Usar páginas acessíveis")}
        </Button>
      )}
      <div
        ref={root}
        className={paged ? "paged-list" : "virtual-list"}
        tabIndex={-1}
        role="list"
        aria-label={label}
        onFocusCapture={(e) =>
          setFocused(
            (e.target as HTMLElement).closest<HTMLElement>("[data-row-id]")
              ?.dataset.rowId ?? null,
          )
        }
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(null);
        }}
        onKeyDown={(e) => {
          if (
            paged ||
            (e.target as HTMLElement).matches("input,textarea,select")
          )
            return;
          const delta =
            e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (!delta && e.key !== "Home" && e.key !== "End") return;
          const index =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? rows.length - 1
                : Math.min(rows.length - 1, Math.max(0, focusIndex + delta));
          e.preventDefault();
          setFocused(rows[index].id);
          virtual.scrollToIndex(index, { align: "auto" });
          requestAnimationFrame(() =>
            root.current
              ?.querySelector<HTMLElement>(
                `[data-index="${index}"] button, [data-index="${index}"] [tabindex]`,
              )
              ?.focus(),
          );
        }}
      >
        {paged ? (
          rows.slice(safePage * 50, safePage * 50 + 50).map((row, i) => (
            <div
              role="listitem"
              aria-setsize={rows.length}
              aria-posinset={safePage * 50 + i + 1}
              data-row-id={row.id}
              key={row.id}
            >
              {render(row)}
            </div>
          ))
        ) : (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((item) => (
              <div
                key={item.key}
                data-index={item.index}
                data-row-id={rows[item.index].id}
                ref={virtual.measureElement}
                role="listitem"
                aria-setsize={rows.length}
                aria-posinset={item.index + 1}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {render(rows[item.index])}
              </div>
            ))}
          </div>
        )}
      </div>
      {paged && rows.length > 50 && (
        <div className="row">
          <Button
            variant="ghost"
            disabled={safePage === 0}
            onClick={() => go(safePage - 1)}
          >
            {t("Anterior")}
          </Button>
          <span role="status">
            {t("Página {{page}} de {{total}}", {
              page: safePage + 1,
              total: Math.ceil(rows.length / 50),
            })}
          </span>
          <Button
            variant="ghost"
            disabled={(safePage + 1) * 50 >= rows.length}
            onClick={() => go(safePage + 1)}
          >
            {t("Próxima")}
          </Button>
        </div>
      )}
    </>
  );
}
