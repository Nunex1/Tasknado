import type { StaticImageData } from "next/image";
import type { Locale } from "@/i18n/core";
import type { ResolvedTheme } from "@/lib/theme";
import overviewPt from "@/assets/landing/overview.pt-BR.webp";
import overviewEn from "@/assets/landing/overview.en-US.webp";
import overviewPtDark from "@/assets/landing/overview.pt-BR.dark.webp";
import overviewEnDark from "@/assets/landing/overview.en-US.dark.webp";
import taskPt from "@/assets/landing/task.pt-BR.webp";
import taskEn from "@/assets/landing/task.en-US.webp";
import taskPtDark from "@/assets/landing/task.pt-BR.dark.webp";
import taskEnDark from "@/assets/landing/task.en-US.dark.webp";
import workspacesPt from "@/assets/landing/workspaces.pt-BR.webp";
import workspacesEn from "@/assets/landing/workspaces.en-US.webp";
import workspacesPtDark from "@/assets/landing/workspaces.pt-BR.dark.webp";
import workspacesEnDark from "@/assets/landing/workspaces.en-US.dark.webp";
import matrixPt from "@/assets/landing/matrix.pt-BR.webp";
import matrixEn from "@/assets/landing/matrix.en-US.webp";
import matrixPtDark from "@/assets/landing/matrix.pt-BR.dark.webp";
import matrixEnDark from "@/assets/landing/matrix.en-US.dark.webp";
import notesPt from "@/assets/landing/notes.pt-BR.webp";
import notesEn from "@/assets/landing/notes.en-US.webp";
import notesPtDark from "@/assets/landing/notes.pt-BR.dark.webp";
import notesEnDark from "@/assets/landing/notes.en-US.dark.webp";
import historyPt from "@/assets/landing/history.pt-BR.webp";
import historyEn from "@/assets/landing/history.en-US.webp";
import historyPtDark from "@/assets/landing/history.pt-BR.dark.webp";
import historyEnDark from "@/assets/landing/history.en-US.dark.webp";

export type ShotName =
  "overview" | "task" | "workspaces" | "matrix" | "notes" | "history";

/**
 * Screenshots of the running application: one set per interface language and
 * per theme, so the page always shows the product as the visitor would see it.
 * Regenerate them with `pnpm capture:landing` (see scripts/capture-landing.mjs).
 */
export const shots: Record<
  ShotName,
  Record<ResolvedTheme, Record<Locale, StaticImageData>>
> = {
  overview: {
    light: { "pt-BR": overviewPt, "en-US": overviewEn },
    dark: { "pt-BR": overviewPtDark, "en-US": overviewEnDark },
  },
  task: {
    light: { "pt-BR": taskPt, "en-US": taskEn },
    dark: { "pt-BR": taskPtDark, "en-US": taskEnDark },
  },
  workspaces: {
    light: { "pt-BR": workspacesPt, "en-US": workspacesEn },
    dark: { "pt-BR": workspacesPtDark, "en-US": workspacesEnDark },
  },
  matrix: {
    light: { "pt-BR": matrixPt, "en-US": matrixEn },
    dark: { "pt-BR": matrixPtDark, "en-US": matrixEnDark },
  },
  notes: {
    light: { "pt-BR": notesPt, "en-US": notesEn },
    dark: { "pt-BR": notesPtDark, "en-US": notesEnDark },
  },
  history: {
    light: { "pt-BR": historyPt, "en-US": historyEn },
    dark: { "pt-BR": historyPtDark, "en-US": historyEnDark },
  },
};
