import { describe, expect, it } from "vitest";
import { check, errorMessage, ServiceError } from "./supabase";
import { retryRead } from "./query-client";
import { readState, type ReadQuery } from "./query-state";

const query = (overrides: Partial<ReadQuery> = {}): ReadQuery => ({
  isPending: false,
  error: null,
  refetch: async () => undefined,
  ...overrides,
});

describe("Read reliability", () => {
  it("preserves backend codes and HTTP status without displaying server text", () => {
    let error: unknown;
    try {
      check({
        data: null,
        status: 404,
        error: { code: "PGRST202", message: "private technical detail" },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toMatchObject({ code: "PGRST202", status: 404 });
    expect(errorMessage(error)).toBe(
      "Serviço temporariamente indisponível. Não foi possível consultar os dados.",
    );
    expect(errorMessage(error)).not.toContain("private");
  });
  it("never treats failed or pending reads as successful empty data", () => {
    expect(readState([query({ isPending: true })]).status).toBe("loading");
    expect(readState([query()]).status).toBe("success");
    expect(
      readState([
        query({ error: new ServiceError("missing", "PGRST202", 404) }),
      ]).status,
    ).toBe("error");
    // An error must win even while another query is pending or old data is retained.
    expect(
      readState([
        query({ isPending: true }),
        query({ error: new Error("network") }),
      ]).status,
    ).toBe("error");
  });
  it("distinguishes expired credentials and denied access", () => {
    expect(
      readState([
        query({ error: new ServiceError("private", "PGRST301", 401) }),
      ]),
    ).toMatchObject({ status: "unauthorized", message: "Sessão expirada" });
    expect(
      readState([query({ error: new ServiceError("private", "42501", 403) })]),
    ).toMatchObject({
      status: "unauthorized",
      message: "Você não tem permissão para executar esta ação.",
    });
  });
  it("retries transient reads once, never schema or permission errors", () => {
    for (const error of [
      new Error("Failed to fetch"),
      new ServiceError("unavailable", undefined, 503),
      new ServiceError("rate limited", undefined, 429),
    ]) {
      expect(retryRead(0, error)).toBe(true);
      expect(retryRead(1, error)).toBe(false);
    }
    for (const [code, status] of [
      ["PGRST202", 404],
      ["42501", 403],
      ["PGRST301", 401],
      ["42883", 500],
      ["42P01", 500],
    ] as const)
      expect(retryRead(0, new ServiceError("error", code, status))).toBe(false);
  });
});
