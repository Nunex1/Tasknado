import { describe, expect, it } from "vitest";
import { inspectContent, MAX_BYTES } from "./upload-content.mjs";
const text = (s) => new TextEncoder().encode(s);
describe("trusted upload content inspection", () => {
  it("accepts plain UTF-8 text and rejects mismatched actual sizes", async () => {
    await expect(
      inspectContent(text("notes"), "text/plain", 5),
    ).resolves.toBeUndefined();
    await expect(
      inspectContent(text("notes"), "text/plain", 1),
    ).rejects.toThrow();
    await expect(
      inspectContent(
        new Uint8Array(MAX_BYTES + 1),
        "text/plain",
        MAX_BYTES + 1,
      ),
    ).rejects.toThrow();
  });
  it("rejects spoofed formats, executables and active text", async () => {
    for (const mime of [
      "image/png",
      "application/pdf",
      "video/mp4",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      await expect(
        inspectContent(text("MZ fake binary"), mime, 14),
      ).rejects.toThrow();
    }
    for (const value of [
      "<script>alert(1)</script>",
      "<svg onload='x'>",
      "a\u0000b",
    ]) {
      await expect(
        inspectContent(text(value), "text/plain", text(value).length),
      ).rejects.toThrow();
    }
  });
  it("rejects PDFs containing active content even with a valid header", async () => {
    const value = text("%PDF-1.7\n/JavaScript (alert)\n%%EOF\n");
    await expect(
      inspectContent(value, "application/pdf", value.length),
    ).rejects.toThrow();
  });
});
