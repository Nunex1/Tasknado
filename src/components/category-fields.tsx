"use client";
import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import {
  CategoryAttributes,
  WorkspaceCategory,
  WorkAttributes,
  quadrant,
  quadrants,
} from "@/lib/domain";
export function CategoryFields({
  category,
  attributes = {},
}: {
  category: WorkspaceCategory;
  attributes?: CategoryAttributes;
}) {
  const { t } = useI18n();
  const [scheduled, setScheduled] = useState(
    attributes.work?.hasScheduledDate ? "yes" : "no",
  );
  if (category === "university")
    return (
      <fieldset>
        <legend>{t("Faculdade")}</legend>
        <label>
          {t("Aberta no Canvas?")}
          <select
            name="canvas"
            required
            defaultValue={
              attributes.university
                ? String(attributes.university.openedInCanvas)
                : ""
            }
          >
            <option value="" disabled>
              {t("Selecione uma opção")}
            </option>
            <option value="true">{t("Sim")}</option>
            <option value="false">{t("Não")}</option>
          </select>
        </label>
      </fieldset>
    );
  if (category !== "work") return null;
  return (
    <fieldset>
      <legend>{t("Planejamento e prioridade")}</legend>
      <label>
        {t("Possui uma data programada?")}
        <select
          name="scheduled"
          value={scheduled}
          onChange={(e) => setScheduled(e.target.value)}
        >
          <option value="no">{t("Não")}</option>
          <option value="yes">{t("Sim")}</option>
        </select>
      </label>
      {scheduled === "yes" && (
        <div className="category-fields">
          <label>
            {t("Data programada")}
            <input
              type="date"
              name="scheduledDate"
              required
              defaultValue={attributes.work?.scheduledDate || ""}
            />
          </label>
          <label>
            {t("Horário programado (opcional)")}
            <input
              type="time"
              name="scheduledTime"
              defaultValue={attributes.work?.scheduledTime || ""}
            />
          </label>
        </div>
      )}
      <div className="category-fields">
        {(["isUrgent", "isImportant"] as const).map((key) => (
          <label key={key}>
            {t(key === "isUrgent" ? "Urgência" : "Importância")}
            <select
              name={key}
              defaultValue={
                attributes.work?.[key] == null
                  ? ""
                  : String(attributes.work[key])
              }
            >
              <option value="">{t("Não definida")}</option>
              <option value="true">
                {t(key === "isUrgent" ? "Urgente" : "Importante")}
              </option>
              <option value="false">
                {t(key === "isUrgent" ? "Não urgente" : "Não importante")}
              </option>
            </select>
          </label>
        ))}
      </div>
      <p className="hint">
        {t("A data programada não altera a prioridade nem o status.")}
      </p>
    </fieldset>
  );
}
export function attributesFromForm(
  category: WorkspaceCategory,
  form: FormData,
  previous: CategoryAttributes = {},
): CategoryAttributes {
  if (category === "university") {
    const value = form.get("canvas");
    if (value !== "true" && value !== "false")
      throw new Error("Selecione uma opção");
    return { ...previous, university: { openedInCanvas: value === "true" } };
  }
  if (category !== "work") return previous;
  const scheduled = form.get("scheduled") === "yes";
  return {
    ...previous,
    work: {
      hasScheduledDate: scheduled,
      scheduledDate: scheduled ? String(form.get("scheduledDate") || "") : null,
      scheduledTime: scheduled
        ? String(form.get("scheduledTime") || "") || null
        : null,
      isUrgent:
        form.get("isUrgent") === "" ? null : form.get("isUrgent") === "true",
      isImportant:
        form.get("isImportant") === ""
          ? null
          : form.get("isImportant") === "true",
    },
  };
}
export function Schedule({ work }: { work?: WorkAttributes }) {
  const { t, locale } = useI18n();
  return (
    <>
      {work?.hasScheduledDate && work.scheduledDate ? (
        <span>
          {new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(
            new Date(`${work.scheduledDate}T12:00:00`),
          )}
          {work.scheduledTime ? ` · ${work.scheduledTime}` : ""}
        </span>
      ) : (
        <span>{t("Sem data programada")}</span>
      )}
    </>
  );
}
export function CategorySummary({
  category,
  attributes,
}: {
  category: WorkspaceCategory;
  attributes: CategoryAttributes;
}) {
  const { t } = useI18n();
  if (category === "university")
    return (
      <p>
        {t("Aberta no Canvas?")}{" "}
        <strong>
          {t(
            attributes.university
              ? attributes.university.openedInCanvas
                ? "Sim"
                : "Não"
              : "Não definida",
          )}
        </strong>
      </p>
    );
  if (category !== "work") return null;
  return (
    <div>
      <p>
        <Schedule work={attributes.work} />
      </p>
      <p>{t(quadrants[quadrant(attributes.work)])}</p>
    </div>
  );
}
