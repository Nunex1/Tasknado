import { errorMessage } from "./supabase";

export type ReadQuery = {
  isPending: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};

/** Only pass enabled queries. Errors take precedence over pending/retained data. */
export function readState(queries: readonly ReadQuery[]) {
  const error = queries.find((query) => query.error)?.error;
  if (error) {
    const message = errorMessage(error);
    return {
      status:
        message === "Sessão expirada" ||
        message === "Você não tem permissão para executar esta ação."
          ? ("unauthorized" as const)
          : ("error" as const),
      message,
    };
  }
  return {
    status: queries.some((query) => query.isPending)
      ? ("loading" as const)
      : ("success" as const),
    message: "",
  };
}
