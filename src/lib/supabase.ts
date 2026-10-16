import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database";
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
  if (message.includes("Conflict"))
    return "Conflito: esta entrada mudou em outra sessão. Seu texto foi preservado. Copie-o antes de recarregar.";
  if (message.includes("Invalid login")) return "E-mail ou senha incorretos.";
  if (message.includes("Email not confirmed"))
    return "Confirme seu e-mail antes de entrar.";
  if (message.includes("Failed to fetch"))
    return "Sem conexão com o servidor. Tente novamente.";
  return message;
}
