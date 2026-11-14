"use client";
import { WindowedList } from "./windowed-list";
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import {
  Activity,
  Quadrant,
  quadrant,
  quadrants,
  priorityFor,
  statuses,
  isOverdue,
} from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { activityPages } from "@/lib/data-queries";
import { Button } from "./ui/button";
import { Schedule } from "./category-fields";
export function PriorityMatrix({
  workspaceId,
  onOpen,
  onChange,
  report,
}: {
  workspaceId: string;
  onOpen: (id: string) => void;
  onChange: () => Promise<void>;
  report: (s: string) => void;
}) {
  const { t, number } = useI18n();
  const [busy, setBusy] = useState(false);
  // Quadrant under the pointer while a card is being dragged.
  const [over, setOver] = useState<Quadrant | null>(null);
  async function move(id: string, q: Quadrant) {
    if (busy || !id) return;
    setBusy(true);
    try {
      const p = priorityFor(q);
      check(
        await client().rpc("set_priority", {
          p_activity: id,
          p_urgent: p.isUrgent,
          p_important: p.isImportant,
        }),
      );
      await onChange();
      report("Salvo com sucesso.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="matrix-section" aria-busy={busy}>
      <h2>{t("Matriz de Eisenhower")}</h2>
      <p className="hint">
        {t("Arraste uma atividade ou use o seletor de quadrante.")}
      </p>
      <div className="matrix-grid">
        {(Object.keys(quadrants) as Quadrant[]).map((q) => {
          // "Q1 · Importante e urgente · Fazer agora" → code, name and action.
          const [code, name, action] =
            q === "unclassified"
              ? ["", t(quadrants[q]), ""]
              : t(quadrants[q]).split(" · ");
          return (
            <section
              className={`panel matrix-quadrant ${q}${over === q ? " drag-over" : ""}`}
              key={q}
              onDragOver={(e) => {
                e.preventDefault();
                if (over !== q) setOver(q);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                void move(e.dataTransfer.getData("text/plain"), q);
              }}
            >
              <MatrixColumn workspaceId={workspaceId} q={q} busy={busy} move={move} onOpen={onOpen} onDragEnd={() => setOver(null)} />
            </section>
          );
        })}
      </div>
    </section>
  );
}

function MatrixColumn({workspaceId, q, busy, move, onOpen, onDragEnd}: {
  workspaceId: string; q: Quadrant; busy: boolean; move: (id: string, q: Quadrant) => Promise<void>;
  onOpen: (id: string) => void; onDragEnd: () => void;
}) {
  const {t, number} = useI18n();
  const [code, name, action] = q === "unclassified" ? ["", t(quadrants[q]), ""] : t(quadrants[q]).split(" · ");
  const filters = {quadrant: q};
  const list = useInfiniteQuery(activityPages(workspaceId, filters));
  const total = useQuery({queryKey: ["activity-total", workspaceId, filters], queryFn: async ({signal}) => check(await client().rpc("activity_total", {p_workspace: workspaceId, p_filters: filters}).abortSignal(signal))});
  const rows = list.data?.pages.flatMap(p => p.rows) ?? [];
  return <>
              <h3>
                {code && <span className="matrix-code">{code}</span>}
                <span>{name}</span>
                <span className="count">{number(total.data ?? rows.length)}</span>
              </h3>
              {action && <p className="matrix-action">{action}</p>}
              <WindowedList rows={rows} label={name} estimate={180} render={(a) => (
                <article
                  className="matrix-card"
                  key={a.id}
                  draggable={!busy}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", a.id)
                  }
                  onDragEnd={onDragEnd}
                >
                  <button className="text-button" onClick={() => onOpen(a.id)}>
                    {a.title}
                  </button>
                  <span className={`badge ${a.status}`}>
                    {t(statuses[a.status])}
                  </span>
                  <p className={isOverdue(a) ? "overdue" : "hint"}>
                    <Schedule work={a.category_attributes.work} />
                    {isOverdue(a) && ` · ${t("Atrasada")}`}
                  </p>
                  <select
                    aria-label={t("Quadrante de {{title}}", { title: a.title })}
                    value={q}
                    disabled={busy}
                    onChange={(e) =>
                      void move(a.id, e.target.value as Quadrant)
                    }
                  >
                    {(Object.keys(quadrants) as Quadrant[]).map((k) => (
                      <option key={k} value={k}>
                        {t(quadrants[k])}
                      </option>
                    ))}
                  </select>
                </article>
              )} />
              {!rows.length && (
                <p className="hint">{t("Nenhuma atividade neste quadrante")}</p>
              )}

    {list.hasNextPage && <Button variant="ghost" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t("Carregar mais")}</Button>}
    {list.error && <p role="alert">{t(errorMessage(list.error))}</p>}
  </>;
}
