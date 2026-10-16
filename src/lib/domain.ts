export type Status = "not_started" | "in_progress" | "paused" | "completed";
export type EventType =
  "check_in" | "pause" | "resume" | "observation" | "check_out";
export const statuses: Record<Status, string> = {
  not_started: "Não iniciada",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
};
export const eventNames: Record<EventType, string> = {
  check_in: "Check In",
  pause: "Pausa",
  resume: "Retomada",
  observation: "Observação",
  check_out: "Check Out",
};
export function actions(status: Status): EventType[] {
  return (
    {
      not_started: ["check_in", "observation"],
      in_progress: ["pause", "observation", "check_out"],
      paused: ["resume", "observation", "check_out"],
      completed: ["observation"],
    } as Record<Status, EventType[]>
  )[status];
}
export interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface Activity {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  status: Status;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface ActivityEvent {
  id: string;
  activity_id: string;
  type: EventType;
  content: string;
  created_at: string;
}
export interface Note {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}
export interface Entry {
  id: string;
  note_id: string;
  content: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface Attachment {
  id: string;
  activity_id: string | null;
  note_id: string | null;
  name: string;
  path: string;
  mime: string;
  size: number;
  created_at: string;
}
export interface SearchResult {
  id: string;
  workspace_id: string;
  parent_id: string;
  kind: string;
  title: string;
  excerpt: string;
  created_at: string;
  status: Status | null;
  mime: string | null;
}
export const mimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
export function validateFile(file: { size: number; type: string }) {
  if (file.size === 0 || file.size > 20 * 1024 * 1024)
    return "O arquivo deve ter entre 1 byte e 20 MB.";
  if (!mimeTypes.includes(file.type))
    return "Formato não permitido. Use PDF, imagem, vídeo, texto ou documento Office.";
  return null;
}
export const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
