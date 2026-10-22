import { describe, expect, it } from "vitest";
import { errorMessage } from "./supabase";
import { createI18n } from "../i18n/core";

describe("Localized service errors", () => {
  it("translates authentication, network and database errors without exposing raw messages", () => {
    const i18n = createI18n("en-US");
    expect(i18n.t(errorMessage(new Error("Invalid login credentials")))).toBe(
      "Incorrect email or password.",
    );
    expect(i18n.t(errorMessage(new Error("Failed to fetch")))).toContain(
      "connect to the server",
    );
    expect(i18n.t(errorMessage(new Error("Invalid transition")))).toContain(
      "current status",
    );
    expect(
      i18n.t(errorMessage(new Error("private internal server detail"))),
    ).not.toContain("private internal");
  });

  it("retains the original message key so errors already shown can change language", () => {
    const key = errorMessage(new Error("Conflict: reload entry before saving"));
    const i18n = createI18n();
    expect(i18n.t(key)).toContain("Seu texto foi preservado");
    void i18n.changeLanguage("en-US");
    expect(i18n.t(key)).toContain("Your text has been preserved");
    expect(errorMessage(new Error("Request conflict"))).not.toBe(key);
  });
});
