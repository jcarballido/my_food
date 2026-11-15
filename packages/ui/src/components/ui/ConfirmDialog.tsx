import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  /** Message shown inside the dialog when the action failed. */
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** Confirmation dialog used for destructive actions such as deleting a recipe. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive = false,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current!;
    if (open) dialog.showModal();
    else dialog.close();
    return () => dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[28px] border border-line bg-paper p-0 shadow-[0_40px_90px_-40px_rgba(47,58,50,0.55)] backdrop:bg-ink/35"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-[28px] bg-paper p-5"
      >
        <h2 id="confirm-title" className="text-xl font-medium text-ink">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-sm leading-relaxed text-ink-soft">
          {message}
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-2xl border border-clay/30 bg-clay-soft px-3.5 py-2.5 text-sm text-[#7f3f30]"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={destructive ? "btn-danger" : "btn-primary"}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
