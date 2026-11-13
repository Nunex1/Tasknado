import { fileTypeFromBuffer } from "file-type";
import { unzipSync } from "fflate";

export const MAX_BYTES = 20 * 1024 * 1024;
const office = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "word/document.xml",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "xl/workbook.xml",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "ppt/presentation.xml",
};
const binary = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
  ...Object.keys(office),
]);

// Format inspection is not an antivirus verdict. Every accepted file must also
// pass the configured malware scanner before scan_status can become clean.
export async function inspectContent(bytes, declaredMime, declaredSize) {
  if (
    !bytes.length ||
    bytes.length > MAX_BYTES ||
    bytes.length !== declaredSize
  )
    throw Error("size_mismatch");
  if (declaredMime === "text/plain" || declaredMime === "text/csv") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) ||
      /<\s*(?:!doctype\s+html|html|script|svg)\b/i.test(text)
    )
      throw Error("active_or_binary_text");
    return;
  }
  if (!binary.has(declaredMime)) throw Error("unsupported_type");
  const detected = await fileTypeFromBuffer(bytes);
  if (detected?.mime !== declaredMime) throw Error("signature_mismatch");
  if (office[declaredMime]) {
    // Inspect the central directory before allocation/decompression. Reject
    // macros, embedded objects, traversal, encrypted and oversized archives.
    let expanded = 0;
    let entries = 0;
    const files = unzipSync(bytes, {
      filter(entry) {
        expanded += entry.originalSize;
        if (
          ++entries > 2000 ||
          expanded > 40 * 1024 * 1024 ||
          entry.originalSize > 10 * 1024 * 1024 ||
          /(^\/|\\|(^|\/)\.\.\/|vbaproject|\/embeddings\/|activex)/i.test(
            entry.name,
          )
        )
          throw Error("unsafe_office_archive");
        return entry.name.endsWith(".xml") || entry.name.endsWith(".rels");
      },
    });
    if (!files[office[declaredMime]] || !files["[Content_Types].xml"])
      throw Error("invalid_office_structure");
    for (const data of Object.values(files)) {
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (
        /<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']|macroEnabled/i.test(
          xml,
        )
      )
        throw Error("active_office_content");
    }
  }
  if (declaredMime === "application/pdf") {
    const pdf = new TextDecoder("latin1").decode(bytes);
    if (
      !pdf.startsWith("%PDF-") ||
      !/%%EOF\s*$/.test(pdf) ||
      /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/.test(pdf)
    )
      throw Error("active_or_invalid_pdf");
  }
}
