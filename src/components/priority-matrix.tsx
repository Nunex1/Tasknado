"use client";
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
import { Schedule } from "./category-fields";
export function PriorityMatrix({
  activities,
  onOpen,
  onChange,
  report,
}: {
  activities: Activity[];
  onOpen: (id: string) => void;
  onChange: () => Promise<void>;
  report: (s: string) => void;
}) {
  const { t, number } = useI18n();
  const [busy, setBusy] = useState(false);
  async function move(id: string, q: Quadrant) {
    if (busy || !activities.some((a) => a.id === id && !a.archived)) return;
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
          const rows = activities.filter(
            (a) => !a.archived && quadrant(a.category_attributes.work) === q,
          );
          return (
            <section
              className={`panel matrix-quadrant ${q}`}
              key={q}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void move(e.dataTransfer.getData("text/plain"), q);
              }}
            >
              <h3>
                {t(quadrants[q])}{" "}
                <span className="count">{number(rows.length)}</span>
              </h3>
              {rows.map((a) => (
                <article
                  className="matrix-card"
                  key={a.id}
                  draggable={!busy}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", a.id)
                  }
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
              ))}
              {!rows.length && (
                <p className="hint">{t("Nenhuma atividade neste quadrante")}</p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
