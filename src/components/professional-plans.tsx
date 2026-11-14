"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, ArrowLeft, ExternalLink } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import type { CareerTarget, DevelopmentItem, Workspace } from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { workspacePath, type View } from "@/lib/navigation";
import {
  careerError,
  careerRegions,
  developmentError,
  developmentStatuses,
  emptyCareer,
  emptyDevelopment,
  literalSearch,
  planPriorities,
  safeOpportunityUrl,
  workModes,
  type CareerValues,
  type DevelopmentValues,
} from "@/lib/professional";
import { Button } from "./ui/button";
import { Modal, ConfirmDialog } from "./ui/dialog";
import "./professional-plans.css";

type Kind = "development" | "career";
type Plan = DevelopmentItem | CareerTarget;
type Editor =
  | {
      kind: "development";
      workspaceId: string;
      workspaceName: string;
      item?: DevelopmentItem;
    }
  | {
      kind: "career";
      workspaceId: string;
      workspaceName: string;
      item?: CareerTarget;
    };
const pageSize = 25;
const conflict =
  "Este registro mudou ou não está mais disponível. Seu texto foi preservado. Copie-o antes de recarregar.";
const tables = {
  development: "professional_development_items",
  career: "career_targets",
} as const;
const titles = {
  development: "Plano de Desenvolvimento Individual",
  career: "Plano de Carreira",
};
const newLabels = {
  development: "Adicionar ponto de desenvolvimento",
  career: "Adicionar empresa alvo",
};

/** The host stays mounted in App after first use. Browser Back/Forward cannot
 * destroy an open editor: its draft stays visible until saved or discarded. */
export function ProfessionalPlans({
  workspace,
  view,
  careerId,
  report,
  onDirty,
  go,
}: {
  workspace?: Workspace;
  view: View;
  careerId: string | null;
  report: (s: string) => void;
  onDirty: (id: string, value: boolean) => void;
  go: (path: string) => void;
}) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [refresh, setRefresh] = useState(0);
  const kind = view === "development" || view === "career" ? view : null;
  return (
    <>
      {kind &&
        (workspace?.category === "work" ? (
          <PlanList
            key={`${workspace.id}:${kind}`}
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            kind={kind}
            careerId={careerId}
            refresh={refresh}
            go={go}
            report={report}
            onEdit={setEditor}
            onChange={() => setRefresh((v) => v + 1)}
          />
        ) : (
          <p role="status">
            {t(
              "Estes planos estão disponíveis apenas em workspaces da categoria Trabalho.",
            )}
          </p>
        ))}
      {editor && (
        <PlanEditor
          key={`${editor.workspaceId}:${editor.kind}:${editor.item?.id ?? "new"}`}
          editor={editor}
          onDirty={onDirty}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setRefresh((v) => v + 1);
            report("Salvo com sucesso.");
          }}
        />
      )}
    </>
  );
}

function PlanList({
  workspaceId,
  workspaceName,
  kind,
  careerId,
  refresh,
  onEdit,
  onChange,
  report,
  go,
}: {
  workspaceId: string;
  workspaceName: string;
  kind: Kind;
  careerId: string | null;
  refresh: number;
  onEdit: (editor: Editor) => void;
  onChange: () => void;
  report: (s: string) => void;
  go: (path: string) => void;
}) {
  const { t, date } = useI18n();
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState(
    kind === "career" ? "sort_order" : "created_at",
  );
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [removing, setRemoving] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    async function load() {
      let request = client()
        .from(tables[kind])
        .select("*")
        .eq("workspace_id", workspaceId);
      if (kind === "career" && careerId) request = request.eq("id", careerId);
      else {
        if (search.trim())
          request = request.ilike(
            kind === "career" ? "company" : "development_area",
            `%${literalSearch(search)}%`,
          );
        if (priority)
          request = request.eq("priority", Number(priority) as 1 | 2 | 3);
        if (kind === "development" && status)
          request = request.filter("status", "eq", status);
        if (kind === "career" && region)
          request = request.filter("region", "eq", region);
      }
      const data = check(
        await request
          .order(sort, {
            ascending: !["created_at", "updated_at"].includes(sort),
          })
          .order("id")
          .range(
            careerId ? 0 : page * pageSize,
            careerId ? 0 : (page + 1) * pageSize,
          )
          .abortSignal(controller.signal),
      ) as Plan[];
      if (controller.signal.aborted) return;
      if (!data.length && page > 0 && !careerId) {
        setPage((p) => p - 1);
        return;
      }
      setRows(data.slice(0, pageSize));
      setMore(data.length > pageSize);
    }
    void load()
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    workspaceId,
    kind,
    careerId,
    refresh,
    search,
    priority,
    status,
    region,
    sort,
    page,
    retry,
  ]);
  const edit = (item?: Plan) =>
    onEdit(
      kind === "development"
        ? {
            kind,
            workspaceId,
            workspaceName,
            item: item as DevelopmentItem | undefined,
          }
        : {
            kind,
            workspaceId,
            workspaceName,
            item: item as CareerTarget | undefined,
          },
    );
  async function remove() {
    if (!removing || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const deleted = check(
        await client()
          .from(tables[kind])
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("id", removing.id)
          .eq("revision", removing.revision)
          .select("id"),
      );
      if (!deleted.length) throw new Error(conflict);
      setRemoving(null);
      onChange();
      report("Registro excluído.");
      if (careerId) go(workspacePath(workspaceId, "career"));
    } catch (e) {
      report(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function changeStatus(
    item: DevelopmentItem,
    value: DevelopmentItem["status"],
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const updated = check(
        await client()
          .from("professional_development_items")
          .update({ status: value })
          .eq("workspace_id", workspaceId)
          .eq("id", item.id)
          .eq("revision", item.revision)
          .select()
          .maybeSingle(),
      );
      if (!updated) throw new Error(conflict);
      onChange();
      report("Salvo com sucesso.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const filters = (
    <div className="plan-filters">
      <label>
        {t(
          kind === "career"
            ? "Filtrar por empresa"
            : "Filtrar por ponto de desenvolvimento",
        )}
        <input
          type="search"
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        {t("Prioridade")}
        <select
          aria-label={t("Prioridade")}
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(0);
          }}
        >
          <option value="">{t("Todas as prioridades")}</option>
          {Object.entries(planPriorities).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      {kind === "development" ? (
        <label>
          {t("Status")}
          <select
            aria-label={t("Status")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("Todos os status")}</option>
            {Object.entries(developmentStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          {t("Região")}
          <select
            aria-label={t("Região")}
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t("Brasil e Exterior")}</option>
            {Object.entries(careerRegions).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t("Ordenar por")}
        <select
          aria-label={t("Ordenar por")}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
        >
          {kind === "career" && (
            <option value="sort_order">{t("Ordem na lista")}</option>
          )}
          <option value="created_at">{t("Data de criação")}</option>
          <option value="updated_at">{t("Última atualização")}</option>
          <option value="priority">{t("Prioridade")}</option>
          {kind === "development" && (
            <option value="status">{t("Status")}</option>
          )}
        </select>
      </label>
    </div>
  );
  function recordActions(item: Plan) {
    return (
      <div className="plan-actions">
        <Button variant="secondary" disabled={busy} onClick={() => edit(item)}>
          <Pencil size={15} />
          {t("Editar")}
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => setRemoving(item)}
        >
          <Trash2 size={15} />
          {t("Excluir")}
        </Button>
      </div>
    );
  }
  function developmentCard(item: DevelopmentItem) {
    return (
      <article className="panel plan-card" key={item.id}>
        <div className="plan-pair">
          <div>
            <h3>{t("Ponto de desenvolvimento")}</h3>
            <p className="preserve">{item.development_area}</p>
          </div>
          <div>
            <h3>{t("Plano de ação")}</h3>
            <p className="preserve">{item.action_plan}</p>
          </div>
        </div>
        <div className="plan-meta">
          <span>
            {t("Prioridade")}: {t(planPriorities[item.priority])}
          </span>
          <label>
            {t("Status")}
            <select
              aria-label={t("Status")}
              value={item.status}
              disabled={busy}
              onChange={(e) =>
                void changeStatus(
                  item,
                  e.target.value as DevelopmentItem["status"],
                )
              }
            >
              {Object.entries(developmentStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details>
          <summary>{t("Informações complementares")}</summary>
          <dl className="plan-details">
            <TextDetail
              label="Data de início"
              value={item.start_date ? date(`${item.start_date}T12:00:00`) : ""}
            />
            <TextDetail
              label="Prazo de conclusão"
              value={item.due_date ? date(`${item.due_date}T12:00:00`) : ""}
            />
            <TextDetail
              label="Critério de sucesso"
              value={item.success_criteria}
            />
            <TextDetail label="Evidências de evolução" value={item.evidence} />
            <TextDetail label="Observações complementares" value={item.notes} />
          </dl>
          {item.career_target_id && (
            <Button
              variant="ghost"
              onClick={() =>
                go(workspacePath(workspaceId, "career", item.career_target_id))
              }
            >
              {t("Ver oportunidade associada")}
            </Button>
          )}
        </details>
        <div className="plan-footer">
          <RecordDates item={item} />
          {recordActions(item)}
        </div>
      </article>
    );
  }
  function careerCard(item: CareerTarget, detail = false) {
    return (
      <article className="panel plan-card" key={item.id}>
        <div className="plan-card-heading">
          <div>
            <h3>{item.company}</h3>
            <p className="preserve">{item.position}</p>
          </div>
          <span className="plan-priority">
            {t(planPriorities[item.priority])}
          </span>
        </div>
        <p>
          {item.country}
          {item.location ? ` · ${item.location}` : ""} ·{" "}
          {t(workModes[item.work_mode])}
        </p>
        <small>
          {t(
            "Informações fornecidas por você. Requisitos não verificados em vagas reais.",
          )}
        </small>
        {detail ? (
          <>
            <h3>{t("Exigências do mercado")}</h3>
            <p className="preserve plan-requirements">
              {item.market_requirements || t("Nenhuma exigência registrada.")}
            </p>
            <dl className="plan-details">
              <TextDetail label="Observações pessoais" value={item.notes} />
              <TextDetail
                label="Ordem na lista"
                value={String(item.sort_order)}
              />
            </dl>
            {safeOpportunityUrl(item.opportunity_url) && (
              <a
                className="plan-external"
                href={item.opportunity_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Abrir oportunidade ou página de carreiras")}
                <ExternalLink size={15} />
              </a>
            )}
          </>
        ) : (
          <Button
            variant="ghost"
            onClick={() => go(workspacePath(workspaceId, "career", item.id))}
          >
            {t("Ver oportunidade")}
          </Button>
        )}
        <div className="plan-footer">
          <RecordDates item={item} />
          {recordActions(item)}
        </div>
      </article>
    );
  }
  return (
    <section className="professional-plans" aria-label={t(titles[kind])}>
      <div className="page-heading">
        <div>
          <h2>{t(titles[kind])}</h2>
          <p>
            {t(
              kind === "development"
                ? "Transforme pontos de desenvolvimento em ações e acompanhe sua evolução."
                : "Organize empresas e oportunidades a partir das informações que você pesquisar.",
            )}
          </p>
        </div>
        <Button onClick={() => edit()}>
          <Plus size={16} />
          {t(newLabels[kind])}
        </Button>
      </div>
      {careerId ? (
        <Button
          variant="ghost"
          onClick={() => go(workspacePath(workspaceId, "career"))}
        >
          <ArrowLeft size={16} />
          {t("Voltar às empresas alvo")}
        </Button>
      ) : (
        filters
      )}
      {loading && <p role="status">{t("Carregando…")}</p>}
      {error && (
        <p role="alert" className="error">
          {t(error)}{" "}
          <Button variant="ghost" onClick={() => setRetry((v) => v + 1)}>
            {t("Tentar novamente")}
          </Button>
        </p>
      )}
      {!loading &&
        !error &&
        (careerId ? (
          rows[0] ? (
            careerCard(rows[0] as CareerTarget, true)
          ) : (
            <p role="status">
              {t("Esta oportunidade não está mais disponível.")}
            </p>
          )
        ) : kind === "development" ? (
          rows.length ? (
            rows.map((row) => developmentCard(row as DevelopmentItem))
          ) : (
            <div className="panel plan-empty">
              <h3>{t("Nenhum ponto de desenvolvimento encontrado.")}</h3>
              <p>{t("Adicione seu primeiro registro ou ajuste os filtros.")}</p>
            </div>
          )
        ) : (
          Object.entries(careerRegions)
            .filter(([value]) => !region || region === value)
            .map(([value, label]) => (
              <section
                className="career-group"
                key={value}
                aria-label={t(label)}
              >
                <h3>{t(label)}</h3>
                {rows.some((row) => (row as CareerTarget).region === value) ? (
                  rows
                    .filter((row) => (row as CareerTarget).region === value)
                    .map((row) => careerCard(row as CareerTarget))
                ) : (
                  <p className="plan-empty">
                    {t(
                      "Nenhuma empresa nesta categoria nesta página. Ajuste os filtros ou adicione uma oportunidade.",
                    )}
                  </p>
                )}
              </section>
            ))
        ))}
      {!careerId && (
        <div className="plan-pagination">
          <Button
            variant="secondary"
            disabled={loading || page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("Página anterior")}
          </Button>
          <span>{t("Página {{page}}", { page: page + 1 })}</span>
          <Button
            variant="secondary"
            disabled={loading || !more}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Próxima página")}
          </Button>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={t("Excluir registro?")}
          description={t(
            kind === "career"
              ? "A oportunidade será excluída. Pontos do PDI serão preservados e desvinculados."
              : "O ponto de desenvolvimento e seu plano de ação serão excluídos permanentemente.",
          )}
          confirmLabel={t("Excluir")}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}

function TextDetail({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return value ? (
    <div>
      <dt>{t(label)}</dt>
      <dd className="preserve">{value}</dd>
    </div>
  ) : null;
}
function RecordDates({ item }: { item: Plan }) {
  const { t, date } = useI18n();
  return (
    <div className="plan-dates">
      <small>
        {t("Data de criação")}:{" "}
        <time dateTime={item.created_at}>{date(item.created_at)}</time>
      </small>
      <small>
        {t("Última atualização")}:{" "}
        <time dateTime={item.updated_at}>{date(item.updated_at)}</time>
      </small>
    </div>
  );
}

function PlanEditor({
  editor,
  onClose,
  onSaved,
  onDirty,
}: {
  editor: Editor;
  onClose: () => void;
  onSaved: () => void;
  onDirty: (id: string, dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [development, setDevelopment] = useState<DevelopmentValues>(() =>
    editor.kind === "development" && editor.item
      ? (Object.fromEntries(
          Object.keys(emptyDevelopment).map((key) => [
            key,
            editor.item![key as keyof DevelopmentValues],
          ]),
        ) as DevelopmentValues)
      : { ...emptyDevelopment },
  );
  const [career, setCareer] = useState<CareerValues>(() =>
    editor.kind === "career" && editor.item
      ? (Object.fromEntries(
          Object.keys(emptyCareer).map((key) => [
            key,
            editor.item![key as keyof CareerValues],
          ]),
        ) as CareerValues)
      : { ...emptyCareer },
  );
  const initial = useRef(
    JSON.stringify(editor.kind === "development" ? development : career),
  );
  const changed =
    JSON.stringify(editor.kind === "development" ? development : career) !==
    initial.current;
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const dirtyKey = `professional:${editor.workspaceId}:${editor.kind}:${editor.item?.id ?? "new"}`;
  useEffect(() => {
    onDirty(dirtyKey, changed || busy);
  }, [onDirty, dirtyKey, changed, busy]);
  useEffect(() => () => onDirty(dirtyKey, false), [onDirty, dirtyKey]);
  function close() {
    if (!saving.current) {
      if (changed) setDiscard(true);
      else onClose();
    }
  }
  async function save() {
    if (saving.current) return;
    const problem =
      editor.kind === "development"
        ? developmentError(development)
        : careerError(career);
    if (problem) {
      setError(problem);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      let saved: Plan | null;
      if (editor.kind === "development") {
        saved = check(
          await (
            editor.item
              ? client()
                  .from("professional_development_items")
                  .update(development)
                  .eq("id", editor.item.id)
                  .eq("workspace_id", editor.workspaceId)
                  .eq("revision", editor.item.revision)
              : client()
                  .from("professional_development_items")
                  .insert({ ...development, workspace_id: editor.workspaceId })
          )
            .select()
            .maybeSingle(),
        );
      } else {
        saved = check(
          await (
            editor.item
              ? client()
                  .from("career_targets")
                  .update(career)
                  .eq("id", editor.item.id)
                  .eq("workspace_id", editor.workspaceId)
                  .eq("revision", editor.item.revision)
              : client()
                  .from("career_targets")
                  .insert({ ...career, workspace_id: editor.workspaceId })
          )
            .select()
            .maybeSingle(),
        );
      }
      if (!saved) throw new Error(conflict);
      onDirty(dirtyKey, false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const devField = (
    key: keyof DevelopmentValues,
    label: string,
    required = false,
  ) => (
    <label>
      {t(label)}
      <textarea
        aria-label={t(label)}
        required={required}
        maxLength={20000}
        rows={required ? 6 : 3}
        value={String(development[key] ?? "")}
        onChange={(e) =>
          setDevelopment((v) => ({ ...v, [key]: e.target.value }))
        }
      />
    </label>
  );
  return (
    <>
      <Modal
        className="plan-modal"
        title={t(
          editor.item
            ? editor.kind === "development"
              ? "Editar ponto de desenvolvimento"
              : "Editar empresa alvo"
            : newLabels[editor.kind],
        )}
        description={t(
          editor.kind === "development"
            ? "Somente o ponto de desenvolvimento e o plano de ação são obrigatórios."
            : "Empresa, país e cargo são obrigatórios. As demais informações são opcionais.",
        )}
        onClose={close}
      >
        <p className="hint">
          {t("Workspace")}: {editor.workspaceName}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy}>
            {editor.kind === "development" ? (
              <>
                <div className="plan-pair">
                  {devField(
                    "development_area",
                    "Ponto de desenvolvimento",
                    true,
                  )}
                  {devField("action_plan", "Plano de ação", true)}
                </div>
                <div className="plan-fields">
                  <label>
                    {t("Data de início")}
                    <input
                      type="date"
                      value={development.start_date ?? ""}
                      onChange={(e) =>
                        setDevelopment((v) => ({
                          ...v,
                          start_date: e.target.value || null,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {t("Prazo de conclusão")}
                    <input
                      type="date"
                      min={development.start_date ?? undefined}
                      value={development.due_date ?? ""}
                      onChange={(e) =>
                        setDevelopment((v) => ({
                          ...v,
                          due_date: e.target.value || null,
                        }))
                      }
                    />
                  </label>
                  <PriorityField
                    value={development.priority}
                    onChange={(priority) =>
                      setDevelopment((v) => ({ ...v, priority }))
                    }
                  />
                  <label>
                    {t("Status")}
                    <select
                      aria-label={t("Status")}
                      value={development.status}
                      onChange={(e) =>
                        setDevelopment((v) => ({
                          ...v,
                          status: e.target.value as DevelopmentItem["status"],
                        }))
                      }
                    >
                      {Object.entries(developmentStatuses).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {t(label)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                {devField("success_criteria", "Critério de sucesso")}
                {devField("evidence", "Evidências de evolução")}
                {devField("notes", "Observações complementares")}
                <CareerPicker
                  workspaceId={editor.workspaceId}
                  selected={development.career_target_id}
                  onSelect={(id) =>
                    setDevelopment((v) => ({ ...v, career_target_id: id }))
                  }
                />
              </>
            ) : (
              <CareerFields value={career} onChange={setCareer} />
            )}
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {t(error)}
            </p>
          )}
          <div className="modal-actions">
            <span className="plan-unsaved" role="status">
              {changed ? t("Alterações não salvas") : ""}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={close}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={busy}>
              {t(busy ? "Salvando…" : "Salvar")}
            </Button>
          </div>
        </form>
      </Modal>
      {discard && (
        <ConfirmDialog
          title={t("Descartar alterações?")}
          description={t(
            "As alterações não salvas deste formulário serão perdidas.",
          )}
          confirmLabel={t("Descartar alterações")}
          busy={false}
          onConfirm={onClose}
          onCancel={() => setDiscard(false)}
        />
      )}
    </>
  );
}

function PriorityField({
  value,
  onChange,
}: {
  value: 1 | 2 | 3;
  onChange: (value: 1 | 2 | 3) => void;
}) {
  const { t } = useI18n();
  return (
    <label>
      {t("Prioridade")}
      <select
        aria-label={t("Prioridade")}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as 1 | 2 | 3)}
      >
        {Object.entries(planPriorities).map(([key, label]) => (
          <option key={key} value={key}>
            {t(label)}
          </option>
        ))}
      </select>
    </label>
  );
}
function CareerFields({
  value,
  onChange,
}: {
  value: CareerValues;
  onChange: (value: CareerValues) => void;
}) {
  const { t, locale } = useI18n();
  // Native suggestions plus unrestricted manual input; new countries and
  // territories do not require a schema or application release.
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const result: string[] = [];
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b),
          name = names.of(code);
        if (name && name !== code) result.push(name);
      }
    return [...new Set(result)].sort((a, b) => a.localeCompare(b, locale));
  }, [locale]);
  const field = (
    key: "company" | "position" | "location",
    label: string,
    required = false,
  ) => (
    <label>
      {t(label)}
      <input
        required={required}
        maxLength={key === "location" ? 300 : 200}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      <div className="plan-fields">
        {field("company", "Nome da empresa", true)}
        {field("position", "Cargo ou posição desejada", true)}
        <label>
          {t("Região")}
          <select
            aria-label={t("Região")}
            value={value.region}
            onChange={(e) =>
              onChange({
                ...value,
                region: e.target.value as CareerTarget["region"],
              })
            }
          >
            {Object.entries(careerRegions).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("País")}
          <input
            required
            list="plan-countries"
            maxLength={120}
            value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value })}
          />
          <small>
            {t("Selecione uma sugestão ou digite outro país ou território.")}
          </small>
        </label>
        <datalist id="plan-countries">
          {countries.map((country) => (
            <option key={country} value={country} />
          ))}
        </datalist>
        {field("location", "Localização da oportunidade")}
        <label>
          {t("Modalidade de trabalho")}
          <select
            aria-label={t("Modalidade de trabalho")}
            value={value.work_mode}
            onChange={(e) =>
              onChange({
                ...value,
                work_mode: e.target.value as CareerTarget["work_mode"],
              })
            }
          >
            {Object.entries(workModes).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <PriorityField
          value={value.priority}
          onChange={(priority) => onChange({ ...value, priority })}
        />
        <label>
          {t("Ordem na lista")}
          <input
            type="number"
            min={0}
            max={1000000}
            step={1}
            required
            value={value.sort_order}
            onChange={(e) =>
              onChange({ ...value, sort_order: e.target.valueAsNumber })
            }
          />
          <small>
            {t(
              "Números menores aparecem primeiro. Edite para reorganizar suas empresas.",
            )}
          </small>
        </label>
      </div>
      <label>
        {t("Link da oportunidade ou página de carreiras")}
        <input
          type="url"
          maxLength={2000}
          value={value.opportunity_url}
          onChange={(e) =>
            onChange({ ...value, opportunity_url: e.target.value })
          }
        />
      </label>
      <label>
        {t("Exigências do mercado")}
        <textarea
          aria-label={t("Exigências do mercado")}
          rows={10}
          maxLength={50000}
          value={value.market_requirements}
          onChange={(e) =>
            onChange({ ...value, market_requirements: e.target.value })
          }
        />
        <small>
          {t(
            "Registre formação, experiência, idiomas, competências, certificações e outros requisitos. Preserve suas anotações como informação pessoal.",
          )}
        </small>
      </label>
      <label>
        {t("Observações pessoais")}
        <textarea
          aria-label={t("Observações pessoais")}
          rows={4}
          maxLength={20000}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </label>
      <p className="hint">
        {t(
          "Informações fornecidas por você. Requisitos não verificados em vagas reais.",
        )}
      </p>
    </>
  );
}

function CareerPicker({
  workspaceId,
  selected,
  onSelect,
}: {
  workspaceId: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<
    Pick<CareerTarget, "id" | "company" | "position">[]
  >([]);
  const [chosen, setChosen] = useState<Pick<
    CareerTarget,
    "id" | "company" | "position"
  > | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!selected) {
      setChosen(null);
      return;
    }
    void client()
      .from("career_targets")
      .select("id,company,position")
      .eq("workspace_id", workspaceId)
      .eq("id", selected)
      .abortSignal(controller.signal)
      .maybeSingle()
      .then((result) => {
        if (!controller.signal.aborted) {
          if (result.error)
            setError(errorMessage(new Error(result.error.message)));
          else setChosen(result.data);
        }
      });
    return () => controller.abort();
  }, [workspaceId, selected, retry]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      void client()
        .from("career_targets")
        .select("id,company,position")
        .eq("workspace_id", workspaceId)
        .ilike("company", `%${literalSearch(query)}%`)
        .order("company")
        .order("id")
        .range(page * 20, page * 20 + 20)
        .abortSignal(controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            if (result.error)
              setError(errorMessage(new Error(result.error.message)));
            else {
              setRows(result.data.slice(0, 20));
              setMore(result.data.length > 20);
            }
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [workspaceId, open, query, page, retry]);
  return (
    <div className="career-picker">
      <h3>{t("Oportunidade associada (opcional)")}</h3>
      {selected && (
        <p>
          {chosen
            ? `${chosen.company} · ${chosen.position}`
            : t(
                "Oportunidade associada indisponível. Você pode remover o vínculo.",
              )}
        </p>
      )}
      <div className="plan-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen((v) => !v)}
        >
          {t(open ? "Fechar seleção" : "Selecionar oportunidade")}
        </Button>
        {selected && (
          <Button type="button" variant="ghost" onClick={() => onSelect(null)}>
            {t("Remover vínculo")}
          </Button>
        )}
      </div>
      {open && (
        <>
          <label>
            {t("Buscar empresa para vincular")}
            <input
              type="search"
              maxLength={200}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          {loading ? (
            <p role="status">{t("Carregando…")}</p>
          ) : (
            rows.map((row) => (
              <Button
                type="button"
                className="career-choice"
                variant="ghost"
                key={row.id}
                onClick={() => {
                  setChosen(row);
                  onSelect(row.id);
                  setOpen(false);
                }}
              >
                {row.company} · {row.position}
              </Button>
            ))
          )}
          {!loading && !rows.length && (
            <p>{t("Nenhuma oportunidade encontrada.")}</p>
          )}
          <div className="plan-pagination">
            <Button
              type="button"
              variant="ghost"
              disabled={!page || loading}
              onClick={() => setPage((v) => v - 1)}
            >
              {t("Página anterior")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!more || loading}
              onClick={() => setPage((v) => v + 1)}
            >
              {t("Próxima página")}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {t(error)}{" "}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRetry((v) => v + 1)}
          >
            {t("Tentar novamente")}
          </Button>
        </p>
      )}
    </div>
  );
}
