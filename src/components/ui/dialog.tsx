"use client";
import { useI18n } from "@/i18n/provider";
import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "./button";
export function Modal({
  title,
  description,
  children,
  onClose,
  initialFocusRef,
  returnFocusRef,
  role = "dialog",
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  role?: "dialog" | "alertdialog";
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          role={role}
          className={className ? "modal " + className : "modal"}
          onOpenAutoFocus={(event) => {
            if (initialFocusRef?.current) {
              event.preventDefault();
              initialFocusRef.current.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <div className="row between">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label={t("Fechar")}>
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {description || t("Preencha os campos abaixo.")}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
/**
 * Confirmation for destructive operations. Focus starts on Cancel, Escape and
 * the overlay cancel, and nothing can be dismissed or confirmed twice while
 * the operation is running.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  returnFocusRef,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      role="alertdialog"
      className="confirm-modal"
      title={title}
      description={description}
      initialFocusRef={cancel}
      returnFocusRef={returnFocusRef}
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="modal-actions">
        <button
          ref={cancel}
          type="button"
          className="button ghost"
          disabled={busy}
          onClick={onCancel}
        >
          {t("Cancelar")}
        </button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? t("Excluindo…") : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
