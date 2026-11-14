"use client";
import { WindowedList } from "./windowed-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { timeCursor, type TimeCursor } from "@/lib/record-queries";
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
  const list = useInfiniteQuery({queryKey:["priority-history",activity.id,activity.updated_at],initialPageParam:null as TimeCursor|null,
    queryFn:async ({signal,pageParam}) => {
      let q=client().from("priority_history").select("id,activity_id,created_at,previous,current").eq("activity_id",activity.id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(51);
      if(pageParam) q=q.or(timeCursor(pageParam,true));
      const data=check(await q.abortSignal(signal)), rows=data.slice(0,50);
      return {rows,next:data.length>50?rows.at(-1):undefined};
    },getNextPageParam:p=>p.next});
  const rows=list.data?.pages.flatMap(p=>p.rows)??[], more=list.hasNextPage;
  async function load(_offset=0) {await list.fetchNextPage();}
  useEffect(()=>{if(list.error)report(errorMessage(list.error));},[list.error,report]);
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
      <WindowedList rows={rows} label={t("Histórico de prioridade")} render={(row) => (
        <article key={row.id}>
          <time dateTime={row.created_at}>{date(row.created_at)}</time>
          <p>
            {label(row.previous)} → {label(row.current)}
          </p>
        </article>
      )} />
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
