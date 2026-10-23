export type Status = "not_started" | "in_progress" | "paused" | "completed";
export type EventType =
  "check_in" | "pause" | "resume" | "observation" | "check_out";
export const statuses: Record<Status, string> = {
  not_started: "Não iniciada",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
};
export function isStarted(status: Status) {
  return status === "in_progress" || status === "paused";
}
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
  category: WorkspaceCategory;
  id: string;
  name: string;
  description: string;
  icon: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface Activity {
  category_attributes: CategoryAttributes;
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
  edited_at: string | null;
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
export const workspaceCategories = {
  personal_life: "Vida Pessoal",
  university: "Faculdade",
  work: "Trabalho",
  self_study: "Estudos Individuais",
  sports: "Esporte",
} as const;
export type WorkspaceCategory = keyof typeof workspaceCategories;
export interface WorkAttributes {
  hasScheduledDate: boolean;
  scheduledDate: string | null;
  scheduledTime: string | null;
  isUrgent: boolean | null;
  isImportant: boolean | null;
}
export interface CategoryAttributes {
  university?: { openedInCanvas: boolean };
  work?: WorkAttributes;
}
export type Quadrant = "q1" | "q2" | "q3" | "q4" | "unclassified";
export const quadrants: Record<Quadrant, string> = {
  q1: "Q1 · Importante e urgente · Fazer agora",
  q2: "Q2 · Importante e não urgente · Programar",
  q3: "Q3 · Não importante e urgente · Simplificar ou automatizar",
  q4: "Q4 · Não importante e não urgente · Reconsiderar ou eliminar",
  unclassified: "Não classificadas",
};
export function quadrant(work?: WorkAttributes): Quadrant {
  if (work?.isUrgent == null || work.isImportant == null) return "unclassified";
  return work.isImportant
    ? work.isUrgent
      ? "q1"
      : "q2"
    : work.isUrgent
      ? "q3"
      : "q4";
}
export function priorityFor(q: Quadrant) {
  return {
    isUrgent: q === "unclassified" ? null : q === "q1" || q === "q3",
    isImportant: q === "unclassified" ? null : q === "q1" || q === "q2",
  };
}
export function isOverdue(activity: Activity, now = new Date()) {
  const w = activity.category_attributes?.work;
  return (
    activity.status !== "completed" &&
    !!w?.hasScheduledDate &&
    !!w.scheduledDate &&
    new Date(`${w.scheduledDate}T${w.scheduledTime || "23:59:59"}`) < now
  );
}
export interface PriorityHistory {
  id: string;
  activity_id: string;
  created_at: string;
  previous: { isUrgent: boolean | null; isImportant: boolean | null };
  current: { isUrgent: boolean | null; isImportant: boolean | null };
}
export interface WorkspaceObservation {
  id: string;
  workspace_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}
export interface WorkspaceEvent {
  id: string;
  activity_id: string | null;
  action: string;
  title: string;
  previous: Record<string, unknown> | string | null;
  current: Record<string, unknown> | string | null;
  created_at: string;
}
