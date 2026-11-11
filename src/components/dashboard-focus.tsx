"use client";
import { CircleAlert, Flag, Pause, Play, Timer } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import {
  Activity,
  Workspace,
  isOverdue,
  isStarted,
  quadrant,
  quadrants,
  statuses,
} from "@/lib/domain";
import { Schedule } from "./category-fields";

const limit = 5;

/**
 * Two short lists above the activity table: what needs attention first and
 * what is already under way. Both are derived from the activities the page
 * has loaded; nothing is fetched or stored here.
 */
export function DashboardFocus({
  activities,
  workspaces,
  workspace,
  onOpen,
  onSeeStarted,
}: {
  activities: Activity[];
  workspaces: Workspace[];
  workspace?: Workspace;
  onOpen: (id: string) => void;
  onSeeStarted: () => void;
}) {
  const { t, number } = useI18n();
  const byId = new Map(workspaces.map((w) => [w.id, w]));
  // Priority attributes only apply while the workspace is in the Work category.
  const isWork = (a: Activity) => byId.get(a.workspace_id)?.category === "work";
  const hasWork = workspace
    ? workspace.category === "work"
    : workspaces.some((w) => w.category === "work" && !w.archived);
  const open = activities.filter((a) => !a.archived);
  const schedule = (a: Activity) =>
    (a.category_attributes.work?.scheduledDate || "9999") +
    (a.category_attributes.work?.scheduledTime || "23:59");
  const priorities = open
    .filter(
      (a) =>
        isWork(a) &&
        a.status !== "completed" &&
        (isOverdue(a) || quadrant(a.category_attributes.work) === "q1"),
    )
    .sort(
      (a, b) =>
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        schedule(a).localeCompare(schedule(b)),
    );
  const started = open
    .filter((a) => isStarted(a.status))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const row = (a: Activity, tags: React.ReactNode) => {
    const Icon = a.status === "paused" ? Pause : Play;
    const work = isWork(a) ? a.category_attributes.work : undefined;
    const name = workspace ? null : byId.get(a.workspace_id)?.name;
    return (
      <button
        key={a.id}
        className={`focus-row ${a.status}`}
        onClick={() => onOpen(a.id)}
      >
        {isStarted(a.status) ? (
          <Icon size={16} aria-hidden="true" />
        ) : (
          <CircleAlert size={16} aria-hidden="true" />
        )}
        <span className="focus-row-text">
          <strong>{a.title}</strong>
          {(name || work) && (
            <small>
              {name}
              {name && work ? " · " : ""}
              {work && <Schedule work={work} />}
            </small>
          )}
        </span>
        <span className="focus-row-tags">{tags}</span>
      </button>
    );
  };

  return (
    <div className="focus-grid">
      {hasWork && (
        <section className="panel focus-panel" aria-labelledby="focus-priority">
          <header>
            <div>
              <h2 id="focus-priority">
                <Flag size={18} aria-hidden="true" />
                {t("Prioridades")}
                <span className="count">{number(priorities.length)}</span>
              </h2>
              <p>{t("Atrasadas ou importantes e urgentes.")}</p>
            </div>
          </header>
          {priorities.slice(0, limit).map((a) =>
            row(
              a,
              <>
                {isOverdue(a) && (
                  <span className="badge overdue-badge">{t("Atrasada")}</span>
                )}
                {quadrant(a.category_attributes.work) === "q1" && (
                  <span className="badge">
                    {t(quadrants.q1).split(" · ").slice(0, 2).join(" · ")}
                  </span>
                )}
              </>,
            ),
          )}
          {!priorities.length && (
            <p className="focus-empty">{t("Nenhuma prioridade pendente.")}</p>
          )}
        </section>
      )}
      <section className="panel focus-panel" aria-labelledby="focus-started">
        <header>
          <div>
            <h2 id="focus-started">
              <Timer size={18} aria-hidden="true" />
              {t("Em andamento")}
              <span className="count">{number(started.length)}</span>
            </h2>
            <p>{t("Iniciadas e ainda não concluídas.")}</p>
          </div>
          {started.length > limit && (
            <button className="text-button" onClick={onSeeStarted}>
              {t("Ver todas")}
            </button>
          )}
        </header>
        {started
          .slice(0, limit)
          .map((a) =>
            row(
              a,
              <span className={`badge ${a.status}`}>
                {t(statuses[a.status])}
              </span>,
            ),
          )}
        {!started.length && (
          <p className="focus-empty">{t("Nenhuma atividade em andamento.")}</p>
        )}
      </section>
    </div>
  );
}
