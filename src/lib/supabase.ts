import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import ptBR from "../i18n/pt-BR.json";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const db = url && key ? createClient<Database>(url, key) : null;
export function client() {
  if (!db) throw new Error("Configure as variáveis do Supabase.");
  return db;
}
export function check<
  T extends { error: { message: string } | null; data?: unknown },
>(result: T): NonNullable<T["data"]> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T["data"]>;
}
export function errorMessage(e: unknown): string {
  const message =
    e instanceof Error ? e.message : "Não foi possível concluir a operação.";
  // Return a catalog key, not a translated string, so visible errors can also
  // change language. Never show arbitrary server text or user content via t().
  if (Object.hasOwn(ptBR, message)) return message;
  const known: [RegExp, string][] = [
    [
      /request conflict/i,
      "Esta solicitação já foi utilizada com outros dados. Reabra a atividade e tente novamente.",
    ],
    [
      /conflict/i,
      "Conflito: esta entrada mudou em outra sessão. Seu texto foi preservado. Copie-o antes de recarregar.",
    ],
    [/invalid login|invalid credentials/i, "E-mail ou senha incorretos."],
    [/email not confirmed/i, "Confirme seu e-mail antes de entrar."],
    [
      /failed to fetch|network|fetch failed/i,
      "Sem conexão com o servidor. Tente novamente.",
    ],
    [
      /authentication required|jwt expired|refresh token|session.*missing/i,
      "Sessão expirada",
    ],
    [/activity unavailable/i, "Atividade indisponível."],
    [/workspace unavailable/i, "Workspace indisponível."],
    [/archived activity/i, "Esta atividade está arquivada."],
    [
      /invalid transition/i,
      "Esta ação não está disponível para o estado atual da atividade.",
    ],
    [
      /too many|rate limit|security purposes/i,
      "Aguarde um momento antes de tentar novamente.",
    ],
    [
      /event does not belong/i,
      "O acontecimento não pertence a esta atividade.",
    ],
    [
      /owner cannot change/i,
      "Não é possível alterar o proprietário deste registro.",
    ],
    [
      /already registered|already been registered/i,
      "Este e-mail já está cadastrado.",
    ],
    [
      /password.*(short|weak|least|contain|different)/i,
      "A senha não atende aos requisitos de segurança.",
    ],
    [/email.*invalid|invalid.*email/i, "Informe um endereço de e-mail válido."],
    [
      /permission|row.level security|access denied/i,
      "Você não tem permissão para executar esta ação.",
    ],
  ];
  return (
    known.find(([pattern]) => pattern.test(message))?.[1] ??
    "Não foi possível concluir a operação."
  );
}
