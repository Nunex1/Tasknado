"use client";
import { useEffect, useState } from "react";
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
  ActivityEvent,
  EventType,
  actions,
  date,
  eventNames,
  statuses,
} from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Files } from "./files";
export function ActivityDetail({
  activity,
  onBack,
  onChange,
  onEdit,
  report,
}: {
  activity: Activity;
  onBack: () => void;
  onChange: () => Promise<void>;
  onEdit: () => void;
  report: (s: string) => void;
}) {
  const [events, setEvents] = useState<ActivityEvent[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [type, setType] = useState<EventType>(actions(activity.status)[0]),
    [content, setContent] = useState("");
  const [request, setRequest] = useState(crypto.randomUUID());
  async function load(offset = 0) {
    const rows = check(
      await client()
        .from("activity_events")
        .select("*")
        .eq("activity_id", activity.id)
        .order("created_at")
        .order("id")
        .range(offset, offset + 49),
    ) as ActivityEvent[];
    setEvents((prev) => (offset ? [...prev, ...rows] : rows));
    setMore(rows.length === 50);
  }
  useEffect(() => {
    void load().catch((e) => report(errorMessage(e)));
    setType(actions(activity.status)[0]);
  }, [activity.id]);
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
  const icons = {
    check_in: Play,
    pause: Pause,
    resume: Play,
    observation: MessageSquare,
    check_out: CheckCircle2,
  };
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} /> Todas as atividades
      </button>
      <div className="page-heading">
        <div>
          <div className="row">
            <span className={"badge " + activity.status}>
              {statuses[activity.status]}
            </span>
            {activity.archived && <span className="badge">Arquivada</span>}
          </div>
          <h1>{activity.title}</h1>
          <p>
            {activity.description ||
              "Adicione uma descrição para contextualizar esta atividade."}
          </p>
        </div>
        <Button variant="secondary" onClick={onEdit}>
          <Pencil size={16} /> Editar
        </Button>
      </div>
      <div className="detail-grid">
        <section className="panel thread">
          <div className="section-heading">
            <h2>
              <History size={19} /> Histórico da atividade
            </h2>
            <span className="hint">Do início até aqui</span>
          </div>
          {events.length === 0 ? (
            <div className="empty">
              <Clock3 />
              <h3>Todo avanço começa com um registro</h3>
              <p>Faça Check In para iniciar e preservar o contexto.</p>
            </div>
          ) : (
            <div className="timeline">
              {events.map((event) => {
                const Icon = icons[event.type];
                return (
                  <article className="timeline-item" key={event.id}>
                    <span className={"timeline-dot " + event.type}>
                      <Icon size={16} />
                    </span>
                    <div className="row between">
                      <strong>{eventNames[event.type]}</strong>
                      <time>{date(event.created_at)}</time>
                    </div>
                    <p className="preserve">{event.content}</p>
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
              Carregar próximos registros
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
                Registrar acontecimento
                <select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as EventType);
                    setRequest(crypto.randomUUID());
                  }}
                >
                  {actions(activity.status).map((t) => (
                    <option key={t} value={t}>
                      {eventNames[t]}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label="Conteúdo do acontecimento"
                placeholder={
                  type === "pause"
                    ? "Onde você parou? O que precisa verificar antes de retomar?"
                    : "O que aconteceu? Registre avanços, verificações e próximos passos."
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
                <small>Registros são permanentes.</small>
                <Button disabled={busy || !content.trim()}>
                  {busy ? "Registrando…" : "Registrar " + eventNames[type]}
                </Button>
              </div>
            </form>
          )}
        </section>
        <aside>
          <section className="panel properties">
            <h3>Sobre esta atividade</h3>
            <dl>
              <dt>Criada em</dt>
              <dd>{date(activity.created_at)}</dd>
              <dt>Última atualização</dt>
              <dd>{date(activity.updated_at)}</dd>
              <dt>Identificador</dt>
              <dd className="mono">{activity.id.slice(0, 8)}</dd>
            </dl>
            {activity.status === "completed" && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void archive()}
              >
                <Archive size={16} />
                {activity.archived ? "Desarquivar" : "Arquivar atividade"}
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
