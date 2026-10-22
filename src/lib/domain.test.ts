import { describe, it, expect } from "vitest";
import { actions, validateFile } from "./domain";
describe("Regras da interface", () => {
  it("oferece apenas transições compatíveis com o estado", () => {
    expect(actions("not_started")).not.toContain("resume");
    expect(actions("paused")).toContain("resume");
    expect(actions("completed")).toEqual(["observation"]);
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
});
