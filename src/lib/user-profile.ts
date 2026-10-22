import type { User } from "@supabase/supabase-js";

export function userProfile(user: User) {
  const name = [
    user.user_metadata?.full_name,
    user.user_metadata?.name,
    user.user_metadata?.display_name,
  ].find(
    (value): value is string => typeof value === "string" && !!value.trim(),
  );
  const email = user.email?.trim() || null;
  return {
    name: name?.trim() || null,
    email,
    initial:
      Array.from(name?.trim() || email || "")[0]?.toLocaleUpperCase("pt-BR") ||
      null,
  };
}
