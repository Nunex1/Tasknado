"use client";
import { useEffect, useState } from "react";
import { Activity, PriorityHistory, quadrant, quadrants } from "@/lib/domain";
import { client, check, errorMessage } from "@/lib/supabase";
import { useI18n } from "@/i18n/provider";
import { Button } from "./ui/button";
export function PriorityHistoryList({
  activity,
  report,
}: {
  activity: Activity;
  report: (s: string) => void;
}) {
  const { t, date } = useI18n();
  const [rows, setRows] = useState<PriorityHistory[]>([]);
  const [more, setMore] = useState(false);
  async function load(offset = 0) {
    const data = check(
      await client()
        .from("priority_history")
        .select("*")
        .eq("activity_id", activity.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 49),
    );
    setRows((prev) => (offset ? [...prev, ...data] : data));
    setMore(data.length === 50);
  }
  useEffect(() => {
    void load().catch((e) => report(errorMessage(e)));
  }, [activity.id, activity.updated_at]);
  const label = (p: PriorityHistory["current"]) =>
    t(
      quadrants[
        quadrant({
          hasScheduledDate: false,
          scheduledDate: null,
          scheduledTime: null,
          ...p,
        })
      ],
    );
  return (
    <section className="panel properties">
      <h3>{t("Histórico de prioridade")}</h3>
      {rows.map((row) => (
        <article key={row.id}>
          <time dateTime={row.created_at}>{date(row.created_at)}</time>
          <p>
            {label(row.previous)} → {label(row.current)}
          </p>
        </article>
      ))}
      {!rows.length && (
        <p className="hint">{t("Nenhuma alteração de prioridade")}</p>
      )}
      {more && (
        <Button
          variant="ghost"
          onClick={() =>
            void load(rows.length).catch((e) => report(errorMessage(e)))
          }
        >
          {t("Carregar mais")}
        </Button>
      )}
    </section>
  );
}
