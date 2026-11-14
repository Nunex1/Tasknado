import { describe, it, expect } from "vitest";
import { actions, attachmentAccess, validateFile } from "./domain";
describe("Regras da interface", () => {
  it("oferece apenas transições compatíveis com o estado", () => {
    expect(actions("not_started")).not.toContain("resume");
    expect(actions("paused")).toContain("resume");
    expect(actions("completed")).toEqual(["resume", "observation"]);
    expect(actions("in_progress")).toContain("pause");
  });
  it("bloqueia arquivos vazios, executáveis e grandes", () => {
    expect(validateFile({ size: 0, type: "image/png" })).toBeTruthy();
    expect(
      validateFile({ size: 21 * 1024 * 1024, type: "application/pdf" }),
    ).toBeTruthy();
    expect(validateFile({ size: 20, type: "text/html" })).toBeTruthy();
    expect(validateFile({ size: 20, type: "image/svg+xml" })).toBeTruthy();
    expect(validateFile({ size: 20, type: "application/pdf" })).toBeNull();
  });
  it("mantém fechado todo arquivo sem veredito limpo quando há quarentena", () => {
    expect(attachmentAccess({ scan_status: "clean" })).toBe("available");
    expect(attachmentAccess({ scan_status: "pending" })).toBe("pending");
    expect(attachmentAccess({ scan_status: "rejected" })).toBe("blocked");
    // A value the interface does not know is never treated as approved.
    expect(attachmentAccess({ scan_status: null })).toBe("pending");
    expect(
      attachmentAccess({ scan_status: "approved" as unknown as "clean" }),
    ).toBe("pending");
  });
  it("abre anexos como antes quando o banco ainda não tem a coluna de quarentena", () => {
    // Row shape returned by a database without the quarantine migration.
    expect(attachmentAccess({})).toBe("legacy");
    expect(attachmentAccess({ scan_status: undefined })).toBe("legacy");
  });
});
