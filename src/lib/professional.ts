import type { CareerTarget, DevelopmentItem } from "./domain";

export const developmentStatuses = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
} as const;
export const planPriorities = { 1: "Alta", 2: "Média", 3: "Baixa" } as const;
export const careerRegions = {
  brazil: "Empresas alvo no Brasil",
  abroad: "Empresas alvo no Exterior",
} as const;
export const workModes = {
  "": "Não informado",
  onsite: "Presencial",
  hybrid: "Híbrido",
  remote: "Remoto",
} as const;
export type DevelopmentValues = Omit<
  DevelopmentItem,
  "id" | "owner_id" | "workspace_id" | "created_at" | "updated_at" | "revision"
>;
export type CareerValues = Omit<
  CareerTarget,
  "id" | "owner_id" | "workspace_id" | "created_at" | "updated_at" | "revision"
>;
export const emptyDevelopment: DevelopmentValues = {
  development_area: "",
  action_plan: "",
  start_date: null,
  due_date: null,
  priority: 2,
  status: "not_started",
  success_criteria: "",
  evidence: "",
  notes: "",
  career_target_id: null,
};
export const emptyCareer: CareerValues = {
  company: "",
  region: "brazil",
  country: "Brasil",
  position: "",
  location: "",
  work_mode: "",
  priority: 2,
  opportunity_url: "",
  market_requirements: "",
  notes: "",
  sort_order: 0,
};
export function safeOpportunityUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !/\s/.test(value) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function developmentError(v: DevelopmentValues): string | null {
  if (!v.development_area.trim() || !v.action_plan.trim())
    return "Preencha o ponto de desenvolvimento e o plano de ação.";
  if (v.start_date && v.due_date && v.due_date < v.start_date)
    return "O prazo deve ser igual ou posterior à data de início.";
  return null;
}
export function careerError(v: CareerValues): string | null {
  if (!v.company.trim() || !v.country.trim() || !v.position.trim())
    return "Preencha a empresa, o país e o cargo desejado.";
  if (v.opportunity_url && !safeOpportunityUrl(v.opportunity_url))
    return "Informe um link HTTP ou HTTPS válido, sem credenciais.";
  if (
    !Number.isInteger(v.sort_order) ||
    v.sort_order < 0 ||
    v.sort_order > 1000000
  )
    return "Informe uma ordem entre 0 e 1000000.";
  return null;
}
/** Plain text search, not PostgREST operators or SQL LIKE wildcards. */
export function literalSearch(value: string) {
  return value
    .trim()
    .slice(0, 200)
    .replace(/[\\%_]/g, "\\$&");
}
