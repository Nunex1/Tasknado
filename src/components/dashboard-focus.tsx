"use client";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { client, check } from "@/lib/supabase";
import { localMinute } from "@/hooks/use-app-data";
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
  workspaceId,
  workspaces,
  workspace,
  onOpen,
  onSeeStarted,
}: {
  workspaceId: string | null;
  workspaces: Workspace[];
  workspace?: Workspace;
  onOpen: (id: string, workspaceId?: string) => void;
  onSeeStarted: () => void;
}) {
  const { t, number } = useI18n();
  const byId = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w])),
    [workspaces],
  );
  const isWork = (a: Activity) => byId.get(a.workspace_id)?.category === "work";
  const hasWork = workspace
    ? workspace.category === "work"
    : workspaces.some((w) => w.category === "work" && !w.archived);
  const [now, setNow] = useState(localMinute);
  useEffect(() => {
    const timer = setInterval(() => setNow(localMinute()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const priorityFilters = { focus: "priority", localNow: now };
  const prioritiesQuery = useQuery({
    queryKey: ["focus", workspaceId, priorityFilters],
    enabled: hasWork,
    queryFn: async ({ signal }) =>
      check(
        await client()
          .rpc("activity_page", {
            p_workspace: workspaceId,
            p_filters: priorityFilters,
            p_sort: "scheduled",
            p_size: limit,
          })
          .abortSignal(signal),
      ).slice(0, limit),
  });
  const priorityTotal = useQuery({
    queryKey: ["activity-total", workspaceId, priorityFilters],
    enabled: hasWork,
    queryFn: async ({ signal }) =>
      check(
        await client()
          .rpc("activity_total", {
            p_workspace: workspaceId,
            p_filters: priorityFilters,
          })
          .abortSignal(signal),
      ),
  });
  const startedQuery = useQuery({
    queryKey: ["focus", workspaceId, "started"],
    queryFn: async ({ signal }) =>
      check(
        await client()
          .rpc("activity_page", {
            p_workspace: workspaceId,
            p_filters: { status: "started" },
            p_size: limit,
          })
          .abortSignal(signal),
      ).slice(0, limit),
  });
  const startedTotal = useQuery({
    queryKey: ["activity-total", workspaceId, { status: "started" }],
    queryFn: async ({ signal }) =>
      check(
        await client()
          .rpc("activity_total", {
            p_workspace: workspaceId,
            p_filters: { status: "started" },
          })
          .abortSignal(signal),
      ),
  });
  const priorities = prioritiesQuery.data ?? [],
    started = startedQuery.data ?? [];
  const row = (a: Activity, tags: React.ReactNode) => {
    const Icon = a.status === "paused" ? Pause : Play;
    const work = isWork(a) ? a.category_attributes.work : undefined;
    const name = workspace ? null : byId.get(a.workspace_id)?.name;
    return (
      <button
        key={a.id}
        className={`focus-row ${a.status}`}
        onClick={() => onOpen(a.id, a.workspace_id)}
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
                <span className="count">{number(priorityTotal.data ?? 0)}</span>
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
              <span className="count">{number(startedTotal.data ?? 0)}</span>
            </h2>
            <p>{t("Iniciadas e ainda não concluídas.")}</p>
          </div>
          {(startedTotal.data ?? 0) > limit && (
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
