import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { userProfile } from "./user-profile";

function user(metadata: User["user_metadata"], email?: string): User {
  return { user_metadata: metadata, email } as User;
}

describe("Dados do perfil autenticado", () => {
  it("obtém o nome dos metadados e preserva caracteres acentuados", () => {
    expect(
      userProfile(user({ full_name: "  Érica Silva  " }, "erica@example.test")),
    ).toEqual({
      name: "Érica Silva",
      email: "erica@example.test",
      initial: "É",
    });
  });

  it("aceita as alternativas de nome e ignora metadados inválidos", () => {
    expect(userProfile(user({ full_name: {}, name: " Ana " })).name).toBe(
      "Ana",
    );
    expect(
      userProfile(user({ full_name: " ", name: 42, display_name: "Bia" })).name,
    ).toBe("Bia");
  });

  it("usa a inicial do e-mail sem inventar um nome para contas sem nome", () => {
    expect(userProfile(user({}, "gabriel@example.test"))).toEqual({
      name: null,
      email: "gabriel@example.test",
      initial: "G",
    });
  });

  it("não inventa dados quando a conta não tem nome nem e-mail", () => {
    expect(userProfile(user({ full_name: null }))).toEqual({
      name: null,
      email: null,
      initial: null,
    });
  });
});
