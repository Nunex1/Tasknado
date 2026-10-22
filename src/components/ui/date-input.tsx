"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import {
  dateFromValue,
  dateValue,
  inputDate,
  parseInputDate,
} from "@/i18n/calendar";
import { Modal } from "./dialog";
import { Button } from "./button";

export function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t, locale, number } = useI18n();
  const id = useId();
  const [text, setText] = useState(() => inputDate(value, locale));
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(
    () => dateFromValue(value) || new Date(),
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const activeDay = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setText(inputDate(value, locale));
    setInvalid(false);
  }, [value, locale]);
  useEffect(() => {
    if (open) activeDay.current?.focus();
  }, [open, focused]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function choose(date: Date | null) {
    const next = date ? dateValue(date) : "";
    onChange(next);
    setText(inputDate(next, locale));
    setInvalid(false);
    close();
  }
  function moveMonth(amount: number) {
    const next = new Date(
      focused.getFullYear(),
      focused.getMonth() + amount,
      1,
      12,
    );
    next.setDate(
      Math.min(
        focused.getDate(),
        new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
      ),
    );
    setFocused(next);
  }
  const start = new Date(focused.getFullYear(), focused.getMonth(), 1, 12);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + index,
        12,
      ),
  );
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(focused);

  return (
    <div className="date-field">
      <label htmlFor={id}>{label}</label>
      <div className="date-input-row">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          lang={locale}
          value={text}
          placeholder={t("dateFormat")}
          maxLength={10}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            if (!raw) {
              onChange("");
              setInvalid(false);
              return;
            }
            const parsed = parseInputDate(raw, locale);
            if (parsed) {
              onChange(parsed);
              setInvalid(false);
            }
          }}
          onBlur={() => setInvalid(!!text && !parseInputDate(text, locale))}
        />
        <button
          ref={trigger}
          type="button"
          className="icon-button"
          aria-label={`${t("Escolher data")} — ${label}`}
          aria-haspopup="dialog"
          onClick={() => {
            setFocused(dateFromValue(value) || new Date());
            setOpen(true);
          }}
        >
          <CalendarDays size={17} />
        </button>
      </div>
      {invalid && (
        <small id={`${id}-error`} className="error">
          {t("Data inválida. Use {{format}}.", { format: t("dateFormat") })}
        </small>
      )}
      {open && (
        <Modal
          title={`${t("Calendário")} — ${label}`}
          description={t("Escolher data")}
          onClose={close}
          initialFocusRef={activeDay}
          returnFocusRef={trigger}
        >
          <div className="calendar-header">
            <button
              type="button"
              className="icon-button"
              aria-label={t("Mês anterior")}
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <strong aria-live="polite">{monthName}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Próximo mês")}
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-grid" role="grid" aria-label={monthName}>
            <div role="row" className="calendar-week">
              {days.slice(0, 7).map((day) => (
                <span
                  role="columnheader"
                  key={day.getDay()}
                  aria-label={new Intl.DateTimeFormat(locale, {
                    weekday: "long",
                  }).format(day)}
                >
                  {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
                    day,
                  )}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, week) => (
              <div role="row" className="calendar-week" key={week}>
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const key = dateValue(day);
                  const isFocused = key === dateValue(focused);
                  return (
                    <div
                      role="gridcell"
                      aria-selected={key === value}
                      key={key}
                    >
                      <button
                        type="button"
                        ref={isFocused ? activeDay : undefined}
                        tabIndex={isFocused ? 0 : -1}
                        className={`calendar-day ${key === value ? "selected" : ""} ${day.getMonth() !== focused.getMonth() ? "muted" : ""}`}
                        aria-label={fullDate.format(day)}
                        aria-current={
                          key === dateValue(new Date()) ? "date" : undefined
                        }
                        onClick={() => choose(day)}
                        onKeyDown={(event) => {
                          const offsets: Record<string, number> = {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                            ArrowDown: 7,
                            Home: -day.getDay(),
                            End: 6 - day.getDay(),
                          };
                          if (event.key in offsets) {
                            event.preventDefault();
                            setFocused(
                              new Date(
                                day.getFullYear(),
                                day.getMonth(),
                                day.getDate() + offsets[event.key],
                                12,
                              ),
                            );
                          }
                          if (
                            event.key === "PageUp" ||
                            event.key === "PageDown"
                          ) {
                            event.preventDefault();
                            moveMonth(event.key === "PageUp" ? -1 : 1);
                          }
                        }}
                      >
                        {number(day.getDate())}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => choose(null)}>
              {t("Limpar data")}
            </Button>
            <Button onClick={() => choose(new Date())}>{t("Hoje")}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
