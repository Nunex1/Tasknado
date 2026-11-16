"use client";
import { useI18n } from "@/i18n/provider";
import { readState, type ReadQuery } from "@/lib/query-state";
import { Button } from "./ui/button";

/** Empty content belongs inside children and is shown only after successful reads. */
export function QueryResult({
  queries,
  children,
}: {
  queries: ReadQuery[];
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const state = readState(queries);
  if (state.status === "loading")
    return (
      <p role="status" aria-busy="true">
        {t("Carregando…")}
      </p>
    );
  if (state.status !== "success")
    return (
      <div role="alert" className="error" data-read-state={state.status}>
        <p>{t(state.message)}</p>
        <Button
          variant="ghost"
          onClick={() =>
            void Promise.all(queries.map((query) => query.refetch()))
          }
        >
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  return children;
}
