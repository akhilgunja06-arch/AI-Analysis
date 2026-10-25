import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/providers/ThemeProvider';
import { Button } from './Button';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Set false for destructive confirmations that need an explicit choice. */
  closeOnOverlay?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
};

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Accessible modal dialog.
 *
 * Traps focus while open, restores focus on close, closes on Escape, locks
 * background scroll, and labels itself with its own heading. Animation is
 * skipped entirely when the member prefers reduced motion.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
  initialFocusRef,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog.
    const target = initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button',
    );
    target?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, initialFocusRef]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            className="absolute inset-0 bg-navy-950/65 backdrop-blur-sm"
            onClick={closeOnOverlay ? onClose : undefined}
            aria-hidden="true"
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border bg-[rgb(var(--ss-bg-alt))] shadow-2xl sm:rounded-2xl',
              SIZES[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-lg font-semibold">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm ss-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-[rgb(var(--ss-border)/0.6)] hover:text-[rgb(var(--ss-text))]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">{footer}</div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Confirmation dialog. Used for every destructive or irreversible action so the
 * member always gets a stated consequence and an explicit choice.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  /** When set, the member must type this exactly to enable confirmation. */
  requireText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  requireText?: string;
}) {
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const canConfirm = !requireText || typed.trim() === requireText;

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnOverlay={!destructive}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm ss-muted">{description}</div>
      {requireText ? (
        <div className="mt-4">
          <label htmlFor={inputId} className="ss-label">
            Type <span className="font-mono font-semibold">{requireText}</span> to confirm
          </label>
          <input
            id={inputId}
            className="ss-input font-mono"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            aria-describedby={`${inputId}-hint`}
          />
          <p id={`${inputId}-hint`} className="ss-hint">
            This action cannot be undone.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}