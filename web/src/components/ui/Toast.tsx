import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  /** Optional inline action, e.g. "Try again". */
  action?: { label: string; onClick: () => void };
};

type ToastContextValue = {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

const STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10',
  error: 'border-rose-500/40 bg-rose-50 dark:bg-rose-500/10',
  info: 'border-electric-500/40 bg-electric-500/5',
  warning: 'border-amber-500/40 bg-amber-50 dark:bg-amber-500/10',
};

const ICON_STYLES: Record<ToastVariant, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-rose-600 dark:text-rose-400',
  info: 'text-electric-600 dark:text-electric-400',
  warning: 'text-amber-600 dark:text-amber-400',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prefersReducedMotion = useReducedMotion();

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-4), { ...toast, id }]);
      // Errors stay longer: they usually need reading.
      const lifetime = toast.variant === 'error' ? 8000 : 4500;
      setTimeout(() => dismiss(id), lifetime);
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ variant: 'success', title, description }),
      error: (title, description) => push({ variant: 'error', title, description }),
      info: (title, description) => push({ variant: 'info', title, description }),
      warning: (title, description) => push({ variant: 'warning', title, description }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.variant];
            return (
              <motion.div
                key={toast.id}
                layout={!prefersReducedMotion}
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'pointer-events-auto w-full max-w-sm rounded-xl border p-4 shadow-lg backdrop-blur-sm',
                  STYLES[toast.variant],
                )}
                role={toast.variant === 'error' ? 'alert' : 'status'}
                aria-live={toast.variant === 'error' ? 'assertive' : 'polite'}
              >
                <div className="flex items-start gap-3">
                  <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_STYLES[toast.variant])} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{toast.title}</p>
                    {toast.description ? (
                      <p className="mt-1 text-sm text-[rgb(var(--ss-text-muted))]">{toast.description}</p>
                    ) : null}
                    {toast.action ? (
                      <button
                        type="button"
                        onClick={() => {
                          toast.action?.onClick();
                          dismiss(toast.id);
                        }}
                        className="mt-2 text-sm font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                      >
                        {toast.action.label}
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(toast.id)}
                    className="rounded-lg p-1 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-black/5 hover:text-[rgb(var(--ss-text))] dark:hover:bg-white/10"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider.');
  return context;
}
