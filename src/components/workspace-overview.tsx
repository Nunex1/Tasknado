"use client";
import { useEffect, useState } from "react";
import { Folder, Plus, ArrowUpRight } from "lucide-react";
import {
  Workspace,
  workspaceCategories,
  SearchResult,
  WorkspaceObservation,
} from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { useI18n } from "@/i18n/provider";
import { Button } from "./ui/button";
export function WorkspaceDirectory({
  workspaces,
  onOpen,
  onCreate,
}: {
  workspaces: Workspace[];
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { t, date } = useI18n();
  const [query, setQuery] = useState("");
  const rows = workspaces.filter(
    (w) =>
      !w.archived &&
      w.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t("Workspaces")}</h1>
          <p>{t("Um lugar para cada parte da sua vida.")}</p>
        </div>
        <Button onClick={onCreate}>
          <Plus size={16} />
          {t("Criar workspace")}
        </Button>
      </div>
      <label className="directory-search">
        {t("Pesquisar workspaces")}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="workspace-directory">
        {rows.map((w) => (
          <button
            className="workspace-directory-row"
            key={w.id}
            onClick={() => onOpen(w.id)}
          >
            <Folder size={22} />
            <div>
              <strong>{w.name}</strong>
              <p>{w.description || t(workspaceCategories[w.category])}</p>
            </div>
            <span className="badge">{t(workspaceCategories[w.category])}</span>
            <time>{date(w.updated_at)}</time>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      {!rows.length && (
        <div className="empty">
          <h2>{t("Nenhum workspace encontrado.")}</h2>
          <p>{t("Crie um workspace para organizar suas atividades.")}</p>
        </div>
      )}
    </>
  );
}
export function RecentObservations({
  workspaceId,
  onOpen,
}: {
  workspaceId: string | null;
  onOpen: (r: SearchResult) => void;
}) {
  const { t, date } = useI18n();
  const [rows, setRows] = useState<WorkspaceObservation[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let q = client()
      .from("workspace_observations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(3);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    q.then((r) => {
      if (live) {
        try {
          setRows(check(r));
        } catch (e) {
          setError(errorMessage(e));
        }
      }
    });
    return () => {
      live = false;
    };
  }, [workspaceId]);
  return (
    <section className="recent-observations">
      <h2>{t("Últimas observações gerais")}</h2>
      {error ? (
        <p role="alert" className="error">
          {t(error)}
        </p>
      ) : rows.length ? (
        rows.map((r) => (
          <button
            key={r.id}
            onClick={() =>
              onOpen({
                id: r.id,
                workspace_id: r.workspace_id,
                parent_id: r.workspace_id,
                kind: "workspace_observation",
                title: "",
                excerpt: r.content,
                created_at: r.created_at,
                status: null,
                mime: null,
              })
            }
          >
            <time>{date(r.created_at)}</time>
            <p>{r.content}</p>
            <ArrowUpRight size={16} />
          </button>
        ))
      ) : (
        <p className="hint">
          {t("As observações dos seus Workspaces aparecerão aqui.")}
        </p>
      )}
    </section>
  );
}
