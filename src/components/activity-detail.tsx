"use client";
import { useI18n } from "@/i18n/provider";
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  History,
  Play,
  Pause,
  CheckCircle2,
  MessageSquare,
  Archive,
  Clock3,
  Pencil,
} from "lucide-react";
import {
  Activity,
  WorkspaceCategory,
  isOverdue,
  ActivityEvent,
  EventType,
  actions,
  eventNames,
  statuses,
} from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";
import { CategorySummary } from "./category-fields";
import { PriorityHistoryList } from "./priority-history";
import { Modal } from "./ui/dialog";
import { Files } from "./files";
export function ActivityDetail({
  activity,
  category,
  onBack,
  onChange,
  onEdit,
  report,
  focusId,
}: {
  activity: Activity;
  category: WorkspaceCategory;
  onBack: () => void;
  onChange: () => Promise<void>;
  onEdit: () => void;
  report: (s: string) => void;
  focusId?: string | null;
}) {
  const { t, date } = useI18n();
  const observationTrigger = useRef<HTMLButtonElement | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [type, setType] = useState<EventType>(actions(activity.status)[0]),
    [content, setContent] = useState("");
  const [observation, setObservation] = useState<ActivityEvent | null>(null);
  const [draft, setDraft] = useState("");
  const [onlyObservations, setOnlyObservations] = useState(false);
  const [newest, setNewest] = useState(true);
  const [request, setRequest] = useState(crypto.randomUUID());
  async function load(offset = 0) {
    let query = client()
      .from("activity_events")
      .select("*")
      .eq("activity_id", activity.id);
    if (onlyObservations) query = query.eq("type", "observation");
    const rows = check(
      await query
        .order("created_at", { ascending: !newest })
        .order("id", { ascending: !newest })
        .range(offset, offset + 49),
    ) as ActivityEvent[];
    const full = rows.length === 50;
    if (focusId && !offset && !rows.some((e) => e.id === focusId)) {
      const found = check(
        await client()
          .from("activity_events")
          .select("*")
          .eq("activity_id", activity.id)
          .eq("id", focusId)
          .maybeSingle(),
      );
      if (found) rows.unshift(found);
    }
    setEvents((prev) => (offset ? [...prev, ...rows] : rows));
    setMore(full);
  }
  useEffect(() => {
    void load().catch((e) => report(errorMessage(e)));
    setType(actions(activity.status)[0]);
  }, [activity.id, onlyObservations, newest, focusId]);
  useEffect(() => {
    if (focusId)
      document
        .getElementById(`event-${focusId}`)
        ?.scrollIntoView({ block: "center" });
  }, [focusId, events]);
  async function submit() {
    setBusy(true);
    try {
      check(
        await client().rpc("add_event", {
          p_activity: activity.id,
          p_type: type,
          p_content: content,
          p_request: request,
        }),
      );
      setContent("");
      setRequest(crypto.randomUUID());
      await onChange();
      await load();
      report("Registro salvo no histórico.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setType(actions(activity.status)[0]);
  }, [activity.status]);
  async function archive() {
    setBusy(true);
    try {
      check(
        await client()
          .from("activities")
          .update({ archived: !activity.archived })
          .eq("id", activity.id),
      );
      await onChange();
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function editObservation() {
    if (!observation) return;
    setBusy(true);
    try {
      check(
        await client().rpc("edit_observation", {
          p_id: observation.id,
          p_content: draft,
          p_expected: observation.content,
        }),
      );
      setObservation(null);
      await load();
      await onChange();
      report("Salvo com sucesso.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteObservation(event: ActivityEvent) {
    if (
      !confirm(t("Excluir esta observação? Esta ação não pode ser desfeita."))
    )
      return;
    setBusy(true);
    try {
      check(
        await client().rpc("delete_observation", {
          p_id: event.id,
          p_expected: event.content,
        }),
      );
      await load();
      await onChange();
      report("Observação excluída.");
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const icons = {
    check_in: Play,
    pause: Pause,
    resume: Play,
    observation: MessageSquare,
    check_out: CheckCircle2,
  };
  return (
    <>
      {observation && (
        <Modal
          title={t("Editar observação")}
          returnFocusRef={observationTrigger}
          onClose={() => {
            if (!busy) setObservation(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void editObservation();
            }}
          >
            <label>
              {t("Observações da atividade")}
              <textarea
                autoFocus
                required
                maxLength={20000}
                rows={6}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <p className="hint">
              {t("Criada em")} {date(observation.created_at)}
            </p>
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setObservation(null)}
              >
                {t("Cancelar")}
              </Button>
              <Button disabled={busy || !draft.trim()}>{t("Salvar")}</Button>
            </div>
          </form>
        </Modal>
      )}
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} /> {t("Todas as atividades")}
      </button>
      <div className="page-heading">
        <div>
          <div className="row">
            <span className={"badge " + activity.status}>
              {t(statuses[activity.status])}
            </span>
            {activity.archived && (
              <span className="badge">{t("Arquivada")}</span>
            )}
          </div>
          <h1>{activity.title}</h1>
          <p>
            {activity.description ||
              t("Adicione uma descrição para contextualizar esta atividade.")}
          </p>
        </div>
        <Button variant="secondary" onClick={onEdit}>
          <Pencil size={16} /> {t("Editar")}
        </Button>
      </div>
      <div className="detail-grid">
        <section className="panel thread">
          <div className="section-heading">
            <h2>
              <History size={19} /> {t("Histórico da atividade")}
            </h2>
            <span className="hint">{t("Do início até aqui")}</span>
          </div>
          <div className="list-toolbar">
            <label>
              {t("Timeline")}
              <select
                value={onlyObservations ? "observations" : "all"}
                onChange={(e) =>
                  setOnlyObservations(e.target.value === "observations")
                }
              >
                <option value="all">{t("Histórico da atividade")}</option>
                <option value="observations">
                  {t("Observações da atividade")}
                </option>
              </select>
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
          {events.length === 0 ? (
            <div className="empty">
              <Clock3 />
              <h3>{t("Todo avanço começa com um registro")}</h3>
              <p>{t("Faça Check In para iniciar e preservar o contexto.")}</p>
            </div>
          ) : (
            <div className="timeline">
              {events.map((event) => {
                const Icon = icons[event.type];
                return (
                  <article
                    id={`event-${event.id}`}
                    className={`timeline-item ${focusId === event.id ? "highlighted" : ""}`}
                    key={event.id}
                  >
                    <span className={"timeline-dot " + event.type}>
                      <Icon size={16} />
                    </span>
                    <div className="row between">
                      <strong>{t(eventNames[event.type])}</strong>
                      <time>{date(event.created_at)}</time>
                    </div>
                    <p className="preserve">{event.content}</p>
                    {event.edited_at && (
                      <small>
                        {t("Editada em")}{" "}
                        <time dateTime={event.edited_at}>
                          {date(event.edited_at)}
                        </time>
                      </small>
                    )}
                    {event.type === "observation" && (
                      <div className="row">
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={(e) => {
                            observationTrigger.current = e.currentTarget;
                            setObservation(event);
                            setDraft(event.content);
                          }}
                        >
                          {t("Editar observação")}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => void deleteObservation(event)}
                        >
                          {t("Excluir observação")}
                        </Button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {more && (
            <Button
              variant="ghost"
              onClick={() =>
                void load(events.length).catch((e) => report(errorMessage(e)))
              }
            >
              {t("Carregar próximos registros")}
            </Button>
          )}
          {!activity.archived && (
            <form
              className="event-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label>
                {t("Registrar acontecimento")}
                <select
                  value={type}
                  disabled={busy}
                  onChange={(e) => {
                    setType(e.target.value as EventType);
                    setRequest(crypto.randomUUID());
                  }}
                >
                  {actions(activity.status).map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {t(eventNames[eventType])}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label={t("Conteúdo do acontecimento")}
                disabled={busy}
                placeholder={
                  type === "pause"
                    ? t(
                        "Onde você parou? O que precisa verificar antes de retomar?",
                      )
                    : t(
                        "O que aconteceu? Registre avanços, verificações e próximos passos.",
                      )
                }
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setRequest(crypto.randomUUID());
                }}
                required
                maxLength={20000}
                rows={4}
              />
              <div className="row between">
                <small>
                  {t(
                    "Eventos de execução são permanentes. Observações podem ser editadas ou excluídas.",
                  )}
                </small>
                <Button disabled={busy || !content.trim()}>
                  {busy
                    ? t("Registrando…")
                    : t("Registrar {{event}}", { event: t(eventNames[type]) })}
                </Button>
              </div>
            </form>
          )}
        </section>
        <aside>
          {category === "work" && (
            <PriorityHistoryList activity={activity} report={report} />
          )}
          <section className="panel properties">
            <h3>{t("Sobre esta atividade")}</h3>
            <CategorySummary
              category={category}
              attributes={activity.category_attributes}
            />
            {category === "work" && isOverdue(activity) && (
              <p className="overdue">{t("Atrasada")}</p>
            )}
            <dl>
              <dt>{t("Criada em")}</dt>
              <dd>{date(activity.created_at)}</dd>
              <dt>{t("Última atualização")}</dt>
              <dd>{date(activity.updated_at)}</dd>
              <dt>{t("Identificador")}</dt>
              <dd className="mono">{activity.id.slice(0, 8)}</dd>
            </dl>
            {activity.status === "completed" && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void archive()}
              >
                <Archive size={16} />
                {activity.archived ? t("Desarquivar") : t("Arquivar atividade")}
              </Button>
            )}
          </section>
          <div className="panel">
            <Files
              id={activity.id}
              kind="activity"
              report={report}
              events={events}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
