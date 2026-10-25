import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Calendar,
  Check,
  CheckCheck,
  MessageSquare,
  Send,
  Settings,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import {
  useClearNotifications,
  useMarkNotificationsRead,
  useNotifications,
} from '@/hooks/queries';
import { cn, formatDateTime, relativeTime } from '@/lib/utils';
import type { NotificationItem } from '@/lib/types';

const ICONS: Record<string, typeof Bell> = {
  EXCHANGE_REQUEST: Send,
  EXCHANGE_ACCEPTED: Check,
  EXCHANGE_DECLINED: BellOff,
  EXCHANGE_UPDATED: Users,
  SESSION_SCHEDULED: Calendar,
  SESSION_CANCELLED: Calendar,
  SESSION_REMINDER: Calendar,
  MESSAGE: MessageSquare,
  REVIEW_RECEIVED: Star,
  REVIEW_PROMPT: Star,
  MODERATION: Bell,
  SYSTEM: Bell,
};

export default function NotificationsPage() {
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data: notifications, isLoading, isError, error, refetch } = useNotifications(unreadOnly);
  const markRead = useMarkNotificationsRead();
  const clear = useClearNotifications();

  const list: NotificationItem[] = notifications ?? [];
  const unreadCount = list.filter((item) => !item.readAt).length;
  const readCount = list.length - unreadCount;

  return (
    <PageContainer size="narrow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Notifications</h1>
          <p className="mt-2 ss-muted">
            {unreadCount > 0
              ? `${unreadCount} unread`
              : list.length > 0
                ? 'Everything is read'
                : 'Nothing yet'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/settings">
            <Button variant="secondary" leftIcon={<Settings className="h-4 w-4" aria-hidden="true" />}>
              Preferences
            </Button>
          </Link>
          {unreadCount > 0 ? (
            <Button
              loading={markRead.isPending}
              onClick={() =>
                markRead.mutate(undefined, {
                  onSuccess: () => toast.success('All marked as read'),
                })
              }
              leftIcon={<CheckCheck className="h-4 w-4" aria-hidden="true" />}
            >
              Mark all read
            </Button>
          ) : null}
          {readCount > 0 ? (
            <Button
              variant="ghost"
              loading={clear.isPending}
              onClick={() =>
                clear.mutate(undefined, {
                  onSuccess: () => toast.success('Read notifications cleared', 'Unread ones were kept.'),
                })
              }
              leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
            >
              Clear read
            </Button>
          ) : null}
        </div>
      </div>

      {/* Filter */}
      <div className="mt-6 flex gap-1 rounded-xl border p-1" role="tablist" aria-label="Notification filter">
        {[
          { value: false, label: 'All' },
          { value: true, label: 'Unread only' },
        ].map((option) => (
          <button
            key={String(option.value)}
            role="tab"
            aria-selected={unreadOnly === option.value}
            onClick={() => setUnreadOnly(option.value)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              unreadOnly === option.value
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'ss-muted hover:bg-[rgb(var(--ss-border)/0.5)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader
          title={unreadOnly ? 'Unread notifications' : 'All notifications'}
          description="Exchange requests, session changes, messages, reminders and reviews."
          icon={<Bell className="h-4 w-4" aria-hidden="true" />}
        />
        <CardBody className="p-0">
          {isError ? (
            <div className="p-5">
              <ErrorState error={error} onRetry={() => void refetch()} compact />
            </div>
          ) : isLoading ? (
            <div className="p-5">
              <SkeletonRows count={5} />
            </div>
          ) : list.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Bell className="h-7 w-7" aria-hidden="true" />}
                title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
                description={
                  unreadOnly
                    ? 'You are all caught up. Switch to “All” to see everything.'
                    : 'When someone sends a request, changes a session or replies to you, it will show up here.'
                }
                action={
                  unreadOnly ? (
                    <Button variant="secondary" onClick={() => setUnreadOnly(false)}>
                      Show all
                    </Button>
                  ) : (
                    <Link to="/matches">
                      <Button>Find a partner</Button>
                    </Link>
                  )
                }
              />
            </div>
          ) : (
            <ul className="divide-y">
              {list.map((notification) => {
                const Icon = ICONS[notification.type] ?? Bell;
                const isUnread = !notification.readAt;
                return (
                  <li
                    key={notification.id}
                    className={cn('flex items-start gap-3.5 p-4', isUnread && 'bg-brand-50/50 dark:bg-brand-500/5')}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        isUnread
                          ? 'bg-gradient-brand text-white'
                          : 'bg-[rgb(var(--ss-border)/0.7)] text-[rgb(var(--ss-text-muted))]',
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn('text-sm', isUnread ? 'font-semibold' : 'font-medium')}>
                          {notification.title}
                        </p>
                        {isUnread ? <Badge variant="brand">New</Badge> : null}
                      </div>
                      {notification.body ? (
                        <p className="mt-1 text-sm ss-muted">{notification.body}</p>
                      ) : null}
                      <p className="mt-1 text-xs ss-subtle" title={formatDateTime(notification.createdAt)}>
                        {relativeTime(notification.createdAt)}
                      </p>

                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {notification.link ? (
                          <Link
                            to={notification.link}
                            onClick={() => {
                              if (isUnread) markRead.mutate(notification.id);
                            }}
                            className="ss-btn-secondary ss-btn-sm"
                          >
                            Open
                          </Link>
                        ) : null}
                        {isUnread ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markRead.mutate(notification.id)}
                            leftIcon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Mark read
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {isUnread ? (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm ss-muted">
            Too many emails? Turn individual categories off in your notification preferences.
          </p>
          <Link to="/settings">
            <Button variant="secondary" size="sm">
              Notification settings
            </Button>
          </Link>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
