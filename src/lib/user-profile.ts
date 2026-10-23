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
  const nickname =
    typeof user.user_metadata?.nickname === "string"
      ? user.user_metadata.nickname.trim()
      : "";
  const customInitial =
    typeof user.user_metadata?.avatar_initial === "string"
      ? user.user_metadata.avatar_initial.normalize("NFC").trim()
      : "";
  const color = /^#[0-9a-f]{6}$/i.test(user.user_metadata?.avatar_color || "")
    ? user.user_metadata.avatar_color
    : "#0353a4";
  return {
    name: name?.trim() || null,
    nickname,
    displayName: nickname || name?.trim() || email || "",
    color,
    email,
    initial:
      (/^\p{L}$/u.test(customInitial)
        ? customInitial
        : Array.from(nickname || name?.trim() || email || "")[0]
      )?.toLocaleUpperCase("pt-BR") || null,
  };
}

export function avatarForeground(color: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
    ? "#000000"
    : "#ffffff";
}
