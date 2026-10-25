import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useNotificationCount, useNotifications, useMarkNotificationsRead, useClearNotifications } from '@/hooks/queries';
import { cn, relativeTime } from '@/lib/utils';
import { SkeletonRows } from '@/components/ui/Feedback';
import { usePrefersReducedMotion } from '@/providers/ThemeProvider';

/** Notification bell with an unread badge and a recent-items dropdown. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const prefersReducedMotion = usePrefersReducedMotion();

  const { data: unread = 0 } = useNotificationCount();
  const { data: notifications, isLoading } = useNotifications(false);
  const markRead = useMarkNotificationsRead();
  const clear = useClearNotifications();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const recent = (notifications ?? []).slice(0, 8);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-[rgb(var(--ss-bg-alt))] transition-colors hover:border-[rgb(var(--ss-ring))]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-[rgb(var(--ss-bg-alt))] shadow-xl"
            role="dialog"
            aria-label="Recent notifications"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Notifications</h3>
              <div className="flex items-center gap-1">
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => markRead.mutate(undefined)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
                  >
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Mark all read
                  </button>
                ) : null}
                {recent.some((n) => n.readAt) ? (
                  <button
                    type="button"
                    onClick={() => clear.mutate()}
                    aria-label="Clear read notifications"
                    className="rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-[rgb(var(--ss-border)/0.6)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="p-3">
                  <SkeletonRows count={3} />
                </div>
              ) : recent.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm ss-muted">
                  Nothing yet. Exchange requests, session changes and replies will appear here.
                </p>
              ) : (
                <ul className="divide-y">
                  {recent.map((notification) => (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!notification.readAt) markRead.mutate(notification.id);
                          setOpen(false);
                          if (notification.link) navigate(notification.link);
                        }}
                        className={cn(
                          'flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--ss-border)/0.35)]',
                          !notification.readAt && 'bg-brand-50/50 dark:bg-brand-500/5',
                        )}
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <span className={cn('text-sm', notification.readAt ? 'font-medium' : 'font-semibold')}>
                            {notification.title}
                          </span>
                          {!notification.readAt ? (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />
                          ) : null}
                        </div>
                        {notification.body ? (
                          <span className="ss-clamp-2 text-xs ss-muted">{notification.body}</span>
                        ) : null}
                        <span className="text-[11px] ss-subtle">{relativeTime(notification.createdAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t px-4 py-2.5">
              <Link
                to="/notifications"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                View all notifications
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
