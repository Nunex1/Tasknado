"use client";
import { useI18n } from "@/i18n/provider";
import { useEffect, useState } from "react";
import {
  Paperclip,
  Download,
  Trash2,
  FileText,
  Image as ImageIcon,
  Film,
} from "lucide-react";
import { client, check, errorMessage } from "@/lib/supabase";
import {
  Attachment,
  ActivityEvent,
  validateFile,
  mimeTypes,
  eventNames,
} from "@/lib/domain";
import { Button } from "./ui/button";
export function Files({
  id,
  kind,
  report,
  events = [],
}: {
  id: string;
  kind: "activity" | "note";
  report: (message: string) => void;
  events?: ActivityEvent[];
}) {
  const { t, date, bytes, number } = useI18n();
  const [eventId, setEventId] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{ file: Attachment; url: string } | null>(
      null,
    );
  async function load() {
    setFiles(
      check(
        await client()
          .from("attachments")
          .select("*")
          .eq(kind + "_id", id)
          .order("created_at"),
      ).map((x) => x as Attachment),
    );
  }
  useEffect(() => {
    void load().catch((e) => report(errorMessage(e)));
    setPreview(null);
  }, [id, kind]);
  async function upload(file: File) {
    const invalid = validateFile(file);
    if (invalid) {
      report(invalid);
      return;
    }
    setBusy(true);
    let path: string | undefined;
    let metaId: string | undefined;
    let uploaded = false;
    try {
      const user = check(await client().auth.getUser()).user;
      if (!user) throw Error("Sessão expirada");
      metaId = crypto.randomUUID();
      path = `${user.id}/${metaId}`;
      check(
        await client()
          .from("attachments")
          .insert({
            id: metaId,
            ...(kind === "activity" ? { activity_id: id } : { note_id: id }),
            name: file.name,
            path,
            mime: file.type,
            size: file.size,
            event_id: eventId || null,
          }),
      );
      check(
        await client()
          .storage.from("attachments")
          .upload(path, file, { contentType: file.type, upsert: false }),
      );
      uploaded = true;
      await load();
      report("Arquivo salvo.");
    } catch (e) {
      if (!uploaded && path)
        await client().storage.from("attachments").remove([path]);
      if (!uploaded && metaId)
        await client().from("attachments").delete().eq("id", metaId);
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function open(file: Attachment, download = false) {
    try {
      const data = check(
        await client()
          .storage.from("attachments")
          .createSignedUrl(
            file.path,
            60,
            download ? { download: file.name } : undefined,
          ),
      );
      if (download) {
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.rel = "noopener";
        a.target = "_blank";
        a.click();
      } else setPreview({ file, url: data.signedUrl });
    } catch (e) {
      report(errorMessage(e));
    }
  }
  async function remove(file: Attachment) {
    if (!confirm(t("Excluir o arquivo “{{name}}”?", { name: file.name })))
      return;
    setBusy(true);
    try {
      check(await client().storage.from("attachments").remove([file.path]));
      check(await client().from("attachments").delete().eq("id", file.id));
      setPreview(null);
      await load();
    } catch (e) {
      report(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="files">
      <div className="row between">
        <h3>
          <Paperclip size={16} /> {t("Arquivos")}{" "}
          <span className="count">{number(files.length)}</span>
        </h3>
        <label
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={busy}
          onKeyDown={(e) => {
            if (!busy && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              e.currentTarget.querySelector("input")?.click();
            }
          }}
          className={"button ghost small " + (busy ? "disabled" : "")}
        >
          {busy ? t("Enviando…") : t("+ Anexar")}
          <input
            aria-label={t("Anexar arquivo")}
            type="file"
            accept={mimeTypes.join(",")}
            disabled={busy}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="hint">{t("Privados · até 20 MB por arquivo")}</p>
      {events.length > 0 && (
        <label className="attachment-event">
          {t("Vincular próximo arquivo")}
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">{t("À atividade")}</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {t(eventNames[event.type])} · {date(event.created_at)}
              </option>
            ))}
          </select>
        </label>
      )}
      {files.length === 0 && (
        <p className="empty-inline">
          {t("Guarde aqui os arquivos que dão contexto.")}
        </p>
      )}
      {files.map((file) => (
        <div className="file-row" key={file.id}>
          {file.mime.startsWith("image/") ? (
            <ImageIcon size={19} />
          ) : file.mime.startsWith("video/") ? (
            <Film size={19} />
          ) : (
            <FileText size={19} />
          )}
          <button className="file-name" onClick={() => void open(file)}>
            <strong>{file.name}</strong>
            <small>
              {bytes(file.size)} · {date(file.created_at)}
            </small>
          </button>
          <button
            className="icon-button"
            aria-label={t("Baixar {{name}}", { name: file.name })}
            onClick={() => void open(file, true)}
          >
            <Download size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Excluir {{name}}", { name: file.name })}
            disabled={busy}
            onClick={() => void remove(file)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {preview && (
        <div className="file-preview">
          <div className="row between">
            <strong>{preview.file.name}</strong>
            <button
              className="icon-button"
              aria-label={t("Fechar visualização")}
              onClick={() => setPreview(null)}
            >
              ×
            </button>
          </div>
          {preview.file.mime.startsWith("image/") ? (
            <img src={preview.url} alt={preview.file.name} />
          ) : preview.file.mime.startsWith("video/") ? (
            <video src={preview.url} controls />
          ) : (
            <p>{t("Baixe o arquivo para abrir no seu aplicativo.")}</p>
          )}
          <Button
            variant="secondary"
            onClick={() => void open(preview.file, true)}
          >
            {t("Baixar arquivo")}
          </Button>
        </div>
      )}
    </section>
  );
}
