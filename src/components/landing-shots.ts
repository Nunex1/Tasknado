import type { StaticImageData } from "next/image";
import type { Locale } from "@/i18n/core";
import overviewPt from "@/assets/landing/overview.pt-BR.webp";
import overviewEn from "@/assets/landing/overview.en-US.webp";
import taskPt from "@/assets/landing/task.pt-BR.webp";
import taskEn from "@/assets/landing/task.en-US.webp";
import workspacesPt from "@/assets/landing/workspaces.pt-BR.webp";
import workspacesEn from "@/assets/landing/workspaces.en-US.webp";
import matrixPt from "@/assets/landing/matrix.pt-BR.webp";
import matrixEn from "@/assets/landing/matrix.en-US.webp";
import notesPt from "@/assets/landing/notes.pt-BR.webp";
import notesEn from "@/assets/landing/notes.en-US.webp";
import historyPt from "@/assets/landing/history.pt-BR.webp";
import historyEn from "@/assets/landing/history.en-US.webp";

export type ShotName =
  "overview" | "task" | "workspaces" | "matrix" | "notes" | "history";

/**
 * Screenshots of the running application, one set per interface language.
 * Regenerate them with `pnpm capture:landing` (see scripts/capture-landing.mjs).
 */
export const shots: Record<ShotName, Record<Locale, StaticImageData>> = {
  overview: { "pt-BR": overviewPt, "en-US": overviewEn },
  task: { "pt-BR": taskPt, "en-US": taskEn },
  workspaces: { "pt-BR": workspacesPt, "en-US": workspacesEn },
  matrix: { "pt-BR": matrixPt, "en-US": matrixEn },
  notes: { "pt-BR": notesPt, "en-US": notesEn },
  history: { "pt-BR": historyPt, "en-US": historyEn },
};
