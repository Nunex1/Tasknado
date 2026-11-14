"use client";
import { WindowedList } from "./windowed-list";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { client, check, errorMessage } from "@/lib/supabase";
import {
  WorkspaceObservation,
  WorkspaceEvent,
  quadrants,
  quadrant,
  WorkAttributes,
  statuses,
  Status,
} from "@/lib/domain";
import { Button } from "./ui/button";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { observationPages } from "@/lib/record-queries";
import { columns, refreshWorkspace } from "@/lib/data-queries";
import { useDebounced } from "@/hooks/use-app-data";

export function WorkspaceObservations({
  workspaceId,
  focusId,
  report,
}: {
  workspaceId: string;
  focusId?: string | null;
  report: (s: string) => void;
}) {
  const { t, date } = useI18n();
  const [query, setQuery] = useState(""),
    [newest, setNewest] = useState(true),
    [content, setContent] = useState(""),
    [editing, setEditing] = useState<WorkspaceObservation | null>(null),
    [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const list = useInfiniteQuery(observationPages(workspaceId, useDebounced(query), newest));
  const focused = useQuery({ queryKey: ["observation", workspaceId, focusId], enabled: !!focusId,
    queryFn: async ({signal}) => check(await client().from("workspace_observations").select(columns.observations).eq("workspace_id",workspaceId).eq("id",focusId!).abortSignal(signal).maybeSingle()) });
  const loaded = list.data?.pages.flatMap(p => p.rows) ?? [];
  const rows = focused.data && !loaded.some(r => r.id === focused.data.id) ? [focused.data,...loaded] : loaded;
  const loading = list.isLoading, error = list.error ? errorMessage(list.error) : "", more = list.hasNextPage;
  async function refresh() {
    await cache.cancelQueries({queryKey: ["observations", workspaceId]});
    cache.setQueriesData<{pages: unknown[]; pageParams: unknown[]}>({queryKey: ["observations", workspaceId]}, old => old && ({pages: old.pages.slice(0,1),pageParams: old.pageParams.slice(0,1)}));
    await Promise.all([cache.invalidateQueries({queryKey: ["observations",workspaceId]}),cache.invalidateQueries({queryKey: ["observation",workspaceId]}),cache.invalidateQueries({queryKey: ["recent-observations"]}),cache.invalidateQueries({queryKey: ["history",workspaceId]}),cache.invalidateQueries({queryKey: ["search"]}),refreshWorkspace(cache,workspaceId)]);
  }
  useEffect(() => {
    if (focusId && !loading)
      document
        .getElementById(`observation-${focusId}`)
        ?.scrollIntoView({ block: "center" });
  }, [focusId, loading]);
  async function save() {
    setBusy(true);
    try {
      if (editing) {
        const saved = check(
          await client()
            .from("workspace_observations")
            .update({ content: content.trim() })
            .eq("id", editing.id)
            .eq("updated_at", editing.updated_at)
            .select("id"),
        );
        if (!saved.length)
          throw Error(
            "Conflito ao salvar. Recarregue o registro e tente novamente.",
          );
      } else
        check(
          await client()
            .from("workspace_observations")
            .insert({ workspace_id: workspaceId, content: content.trim() }),
        );
      setContent("");
      setEditing(null);
      await refresh();
      report("Salvo com sucesso.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: WorkspaceObservation) {
    if (
      !confirm(t("Excluir esta observação? Esta ação não pode ser desfeita."))
    )
      return;
    setBusy(true);
    try {
      const deleted = check(
        await client()
          .from("workspace_observations")
          .delete()
          .eq("id", row.id)
          .eq("updated_at", row.updated_at)
          .select("id"),
      );
      if (!deleted.length)
        throw Error(
          "Conflito ao salvar. Recarregue o registro e tente novamente.",
        );
      await refresh();
      report("Observação excluída.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="records-section">
      <div className="section-heading">
        <div>
          <h2>{t("Observações gerais")}</h2>
          <p>{t("Registros do Workspace, independentes das atividades.")}</p>
        </div>
      </div>
      <form
        className="observation-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {t(editing ? "Editar observação" : "Nova observação")}
          <textarea
            id="workspace-observation-content"
            aria-label={t(editing ? "Editar observação" : "Nova observação")}
            value={content}
            disabled={busy}
            onChange={(e) => setContent(e.target.value)}
            required
            maxLength={20000}
            rows={3}
          />
        </label>
        <div className="row">
          <Button disabled={busy || !content.trim()}>
            {t(
              busy
                ? "Salvando…"
                : editing
                  ? "Salvar alterações"
                  : "Registrar observação",
            )}
          </Button>
          {(editing || content) && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setContent("");
              }}
            >
              {t("Cancelar")}
            </Button>
          )}
        </div>
      </form>
      <div className="list-toolbar">
        <label>
          {t("Pesquisar observações")}
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            type="search"
          />
        </label>
        <label>
          {t("Ordem")}
          <select
            value={newest ? "new" : "old"}
            onChange={(e) => setNewest(e.target.value === "new")}
          >
            <option value="new">{t("Mais recentes primeiro")}</option>
            <option value="old">{t("Mais antigas primeiro")}</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {t(error)}{" "}
          <button onClick={() => void list.refetch()}>
            {t("Tentar novamente")}
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">{t("Carregando…")}</p>
      ) : !rows.length ? (
        <p className="empty">{t("Nenhuma observação encontrada.")}</p>
      ) : (
        <div className="document-timeline">
          <WindowedList rows={rows} label={t("Histórico")} estimate={160} render={(row) => (
            <article
              key={row.id}
              id={`observation-${row.id}`}
              className={row.id === focusId ? "record highlighted" : "record"}
            >
              <div className="row between">
                <time dateTime={row.created_at}>{date(row.created_at)}</time>
                <div className="row">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(row);
                      setContent(row.content);
                      document
                        .getElementById("workspace-observation-content")
                        ?.focus();
                    }}
                  >
                    {t("Editar")}
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => void remove(row)}
                  >
                    {t("Excluir")}
                  </button>
                </div>
              </div>
              <p className="preserve">{row.content}</p>
              {row.updated_at !== row.created_at && (
                <small>
                  {t("Editada em")} {date(row.updated_at)}
                </small>
              )}
            </article>
          )} />
        </div>
      )}
      {more && (
        <Button variant="ghost" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {t("Carregar mais")}
        </Button>
      )}
    </section>
  );
}
const actionNames: Record<string, string> = {
  activity_created: "Atividade criada",
  status_changed: "Status alterado",
  observation_created: "Observação criada",
  observation_edited: "Observação editada",
  observation_deleted: "Observação excluída",
  schedule_changed: "Agendamento alterado",
  priority_changed: "Prioridade alterada",
  check_in: "Check In",
  pause: "Pausa",
  resume: "Retomada",
  check_out: "Check Out",
};
export function WorkspaceHistory({
  workspaceId,
  onOpen,
}: {
  workspaceId: string;
  onOpen: (id: string) => void;
}) {
  const { t, date } = useI18n();
  const list = useInfiniteQuery({queryKey:["history",workspaceId],initialPageParam:0,
    queryFn:async ({signal,pageParam}) => check(await client().rpc("workspace_timeline",{p_workspace:workspaceId,p_offset:pageParam}).abortSignal(signal)),
    getNextPageParam:(last,pages)=>last.length===50?pages.length*50:undefined});
  const rows=list.data?.pages.flat()??[], loading=list.isFetching, more=list.hasNextPage, error=list.error?errorMessage(list.error):"";
  function value(value: WorkspaceEvent["current"], action: string): string {
    if (value == null) return t("Não definida");
    if (typeof value === "string") return t(statuses[value as Status] || value);
    if (action === "priority_changed")
      return t(quadrants[quadrant(value as unknown as WorkAttributes)]);
    if (action === "schedule_changed")
      return value.hasScheduledDate
        ? `${value.scheduledDate}${value.scheduledTime ? " · " + value.scheduledTime : ""}`
        : t("Sem data programada");
    return typeof value.content === "string" ? value.content : "";
  }
  return (
    <section className="records-section">
      <div className="section-heading">
        <div>
          <h2>{t("Histórico operacional")}</h2>
          <p>{t("Eventos persistidos, do mais recente ao mais antigo.")}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {t(error)}{" "}
          <button onClick={() => void list.refetch()}>
            {t("Tentar novamente")}
          </button>
        </p>
      )}
      <div className="document-timeline">
        <WindowedList rows={rows} label={t("Histórico")} estimate={160} render={(row) => (
          <article className="record" key={row.action + row.id}>
            <time dateTime={row.created_at}>{date(row.created_at)}</time>
            <h3>{t(actionNames[row.action] || row.action)}</h3>
            {row.activity_id ? (
              <button
                className="text-button"
                onClick={() => onOpen(row.activity_id!)}
              >
                {row.title}
              </button>
            ) : (
              <small>{t("Observações gerais")}</small>
            )}
            {row.action.endsWith("_changed") ? (
              <p className="preserve">
                {value(row.previous, row.action)} →{" "}
                {value(row.current, row.action)}
              </p>
            ) : (
              row.current && (
                <p className="preserve">{value(row.current, row.action)}</p>
              )
            )}
          </article>
        )} />
      </div>
      {loading && <p role="status">{t("Carregando…")}</p>}
      {!loading && !rows.length && !error && (
        <p className="empty">{t("Nenhum evento registrado.")}</p>
      )}
      {more && !loading && (
        <Button variant="ghost" onClick={() => void list.fetchNextPage()}>
          {t("Carregar mais")}
        </Button>
      )}
    </section>
  );
}
