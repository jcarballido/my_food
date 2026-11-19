import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}

/**
 * Accessible dialog wrapper.
 *
 * Handles the backdrop, Escape-to-close and the labelling attributes that
 * screen readers rely on.
 */
export function Modal({ open, title, onClose, children, footer, busy = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    if (open) dialog.showModal();
    else dialog.close();
    return () => dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-lg rounded-[28px] border border-line bg-paper p-0 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.45)] backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line/80 px-5 py-4">
          <h2 id={titleId} className="text-xl font-medium text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-ghost -mr-2 h-9 w-9 px-0"
            aria-label="Close dialog"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/80 bg-cream/45 px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
