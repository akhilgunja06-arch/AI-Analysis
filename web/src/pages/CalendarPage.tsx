import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  List,
  Video,
  X,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, FormatBadge } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn, detectTimezone, formatDuration, formatSessionTime, pluralise } from '@/lib/utils';
import {
  useCreateSession,
  useDeleteSession,
  useExchanges,
  useSessions,
  useUpdateSession,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import type { CalendarSession, SessionFormat } from '@/lib/types';

type View = 'month' | 'agenda';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // Convert Sunday-first to Monday-first.
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

export default function CalendarPage() {
  const toast = useToast();
  const today = new Date();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarSession | null>(null);
  const [cancelling, setCancelling] = useState<CalendarSession | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: exchanges } = useExchanges();
  const { data: sessions, isLoading, isError, error, refetch } = useSessions({ status: statusFilter || undefined });
  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const deleteSession = useDeleteSession();

  // Form state
  const [exchangeId, setExchangeId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [format, setFormat] = useState<SessionFormat>('ONLINE');
  const [meetingUrl, setMeetingUrl] = useState('');

  const timezone = detectTimezone();

  const days = useMemo(() => monthMatrix(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const session of sessions ?? []) {
      const key = new Date(session.startsAt).toDateString();
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    return map;
  }, [sessions]);

  const upcoming = useMemo(
    () =>
      (sessions ?? [])
        .filter((session) => session.status === 'SCHEDULED' && new Date(session.startsAt) >= new Date())
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [sessions],
  );

  const activeExchanges = (exchanges ?? []).filter((exchange) =>
    ['ACCEPTED', 'ACTIVE', 'PAUSED'].includes(exchange.status),
  );

  const openCreate = (dayKey?: string) => {
    const target = dayKey ?? selectedDay ?? new Date().toDateString();
    const parsed = new Date(target);
    setDate(
      `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
    );
    setExchangeId(activeExchanges[0]?.id ?? '');
    setTitle('');
    setAgenda('');
    setMeetingUrl('');
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!exchangeId) {
      toast.error('Pick an exchange', 'A session has to belong to an exchange.');
      return;
    }
    const startsAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      toast.error('That date and time is not valid');
      return;
    }
    try {
      await createSession.mutateAsync({
        exchangeId,
        startsAt: startsAt.toISOString(),
        durationMinutes: Number(duration),
        timezone,
        format,
        meetingUrl: meetingUrl.trim() || undefined,
        title: title.trim() || undefined,
        agenda: agenda.trim() || undefined,
      });
      toast.success('Session scheduled', 'Both participants can see it now.');
      setCreateOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SCHEDULE_CONFLICT') {
        toast.error('That time clashes', 'One of you already has a session in that window.');
      } else {
        toast.error('Could not schedule', err instanceof ApiError ? err.message : undefined);
      }
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateSession.mutateAsync({
        id: editing.id,
        title: editing.title,
        agenda: editing.agenda,
        durationMinutes: editing.durationMinutes,
        meetingUrl: editing.meetingUrl,
        format: editing.format,
      });
      toast.success('Session updated');
      setEditing(null);
    } catch (err) {
      toast.error('Could not update', err instanceof ApiError ? err.message : undefined);
    }
  };

  const selectedSessions = selectedDay ? (sessionsByDay.get(selectedDay) ?? []) : [];

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Calendar</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm ss-muted">
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            All times shown in {timezone.replace(/_/g, ' ')}. Session conflicts are checked before booking.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 rounded-xl border p-1" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setView('month')}
              aria-pressed={view === 'month'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                view === 'month' ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'ss-muted',
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Month
            </button>
            <button
              type="button"
              onClick={() => setView('agenda')}
              aria-pressed={view === 'agenda'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                view === 'agenda' ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'ss-muted',
              )}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Agenda
            </button>
          </div>
          <Button
            onClick={() => openCreate()}
            disabled={activeExchanges.length === 0}
            leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
          >
            Schedule session
          </Button>
        </div>
      </div>

      {activeExchanges.length === 0 && !isLoading ? (
        <Card className="mt-6 border-amber-500/35 bg-amber-50/50 dark:bg-amber-500/5">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm">
              <strong>You have no active exchanges.</strong> Sessions belong to an exchange, so accept a
              request or propose one first.
            </p>
            <Link to="/matches">
              <Button size="sm" variant="secondary">
                Find a partner
              </Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      {/* Filter */}
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <SelectField
          label="Show"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          placeholder="All sessions"
          options={[
            { value: 'SCHEDULED', label: 'Scheduled only' },
            { value: 'COMPLETED', label: 'Completed only' },
            { value: 'CANCELLED', label: 'Cancelled only' },
            { value: 'NO_SHOW', label: 'No shows only' },
          ]}
        />
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading your calendar" />
      ) : view === 'month' ? (
        <>
          {/* Month grid */}
          <Card className="mt-6">
            <CardBody>
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                  aria-label="Previous month"
                  leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
                >
                  Previous
                </Button>
                <h2 className="font-display text-lg font-semibold" aria-live="polite">
                  {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                  aria-label="Next month"
                  rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
                >
                  Next
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((day) => (
                  <div key={day} className="pb-2 text-center text-xs font-semibold ss-subtle">
                    <span className="hidden sm:inline">{day}</span>
                    <span className="sm:hidden">{day.charAt(0)}</span>
                  </div>
                ))}

                {days.map((day) => {
                  const key = day.toDateString();
                  const isCurrentMonth = day.getMonth() === cursor.getMonth();
                  const isToday = key === new Date().toDateString();
                  const daySessions = sessionsByDay.get(key) ?? [];
                  const scheduled = daySessions.filter((s) => s.status === 'SCHEDULED');

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDay(key)}
                      aria-label={`${day.toDateString()}, ${scheduled.length} ${pluralise(scheduled.length, 'session')}`}
                      className={cn(
                        'relative flex min-h-[68px] flex-col rounded-xl border p-2 text-left transition-colors sm:min-h-[92px]',
                        !isCurrentMonth && 'opacity-40',
                        isToday && 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10',
                        selectedDay === key && !isToday && 'border-[rgb(var(--ss-ring))]',
                        'hover:border-[rgb(var(--ss-ring))]',
                      )}
                    >
                      <span
                        className={cn(
                          'text-xs font-semibold tabular-nums',
                          isToday && 'text-brand-700 dark:text-brand-300',
                        )}
                      >
                        {day.getDate()}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-0.5">
                        {scheduled.slice(0, 3).map((session) => (
                          <span
                            key={session.id}
                            className="h-1.5 w-1.5 rounded-full bg-brand-500"
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                      {scheduled.length > 0 ? (
                        <span className="mt-auto hidden text-[10px] ss-subtle sm:block">
                          {scheduled.length} {pluralise(scheduled.length, 'session')}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {/* Selected day detail */}
          {selectedDay ? (
            <Card className="mt-4">
              <CardHeader
                title={new Date(selectedDay).toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
                description={`${selectedSessions.length} ${pluralise(selectedSessions.length, 'session')} on this day`}
                icon={<CalendarIcon className="h-4 w-4" aria-hidden="true" />}
                action={
                  <Button size="sm" variant="secondary" onClick={() => openCreate(selectedDay)}>
                    Add session
                  </Button>
                }
              />
              <CardBody>
                {selectedSessions.length === 0 ? (
                  <EmptyState
                    compact
                    title="Nothing scheduled"
                    description="This day is free. Schedule a session if you and your partner are available."
                    action={
                      <Button size="sm" variant="secondary" onClick={() => openCreate(selectedDay)}>
                        Schedule on this day
                      </Button>
                    }
                  />
                ) : (
                  <ul className="space-y-3">
                    {selectedSessions.map((session) => (
                      <SessionListItem
                        key={session.id}
                        session={session}
                        onEdit={() => setEditing(session)}
                        onCancel={() => setCancelling(session)}
                      />
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : null}
        </>
      ) : (
        /* Agenda view */
        <Card className="mt-6">
          <CardHeader
            title="Upcoming sessions"
            description="Soonest first."
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon className="h-7 w-7" aria-hidden="true" />}
                title="No upcoming sessions"
                description="Once you schedule a session it appears here in order."
                action={
                  <Button
                    onClick={() => openCreate()}
                    disabled={activeExchanges.length === 0}
                    leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
                  >
                    Schedule a session
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {upcoming.map((session) => (
                  <SessionListItem
                    key={session.id}
                    session={session}
                    onEdit={() => setEditing(session)}
                    onCancel={() => setCancelling(session)}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* Past and cancelled */}
      {!isLoading && (sessions ?? []).some((s) => s.status !== 'SCHEDULED') ? (
        <Card className="mt-4">
          <CardHeader
            title="Past and cancelled"
            description="Kept for your records."
            icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <ul className="space-y-3">
              {(sessions ?? [])
                .filter((s) => s.status !== 'SCHEDULED')
                .slice(0, 10)
                .map((session) => (
                  <SessionListItem key={session.id} session={session} />
                ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {/* ------------------------------------------------ create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Schedule a session"
        description="The server checks both participants' calendars before booking."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} loading={createSession.isPending}>
              Schedule
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Exchange"
            value={exchangeId}
            onChange={(event) => setExchangeId(event.target.value)}
            placeholder="Choose an exchange"
            required
            options={activeExchanges.map((exchange) => ({
              value: exchange.id,
              label: exchange.title,
            }))}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <TextField label="Start time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            <SelectField
              label="Duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }))}
            />
          </div>
          <TextField
            label="Topic"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Testing and fixtures"
          />
          <TextAreaField
            label="Agenda"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            maxLength={500}
            showCount
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Format"
              value={format}
              onChange={(e) => setFormat(e.target.value as SessionFormat)}
              options={[
                { value: 'ONLINE', label: 'Online' },
                { value: 'IN_PERSON', label: 'In person' },
                { value: 'EITHER', label: 'Either' },
              ]}
            />
            <TextField
              label="Meeting link"
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://…"
              hint="Visible only to the two participants."
            />
          </div>
        </div>
      </Modal>

      {/* ------------------------------------------------ edit modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit session"
        description="The date and time cannot be changed here — cancel and rebook instead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={updateSession.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <TextField
              label="Topic"
              value={editing.title ?? ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              maxLength={120}
            />
            <TextAreaField
              label="Agenda"
              value={editing.agenda ?? ''}
              onChange={(e) => setEditing({ ...editing, agenda: e.target.value })}
              maxLength={500}
              showCount
            />
            <SelectField
              label="Duration"
              value={String(editing.durationMinutes)}
              onChange={(e) => setEditing({ ...editing, durationMinutes: Number(e.target.value) })}
              options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }))}
            />
            <TextField
              label="Meeting link"
              type="url"
              value={editing.meetingUrl ?? ''}
              onChange={(e) => setEditing({ ...editing, meetingUrl: e.target.value })}
            />
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------------------------- cancel dialog */}
      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          deleteSession.mutate(cancelling.id, {
            onSuccess: () => {
              toast.success('Session cancelled', 'Your partner has been notified.');
              setCancelling(null);
            },
            onError: (err) => toast.error('Could not cancel', err instanceof ApiError ? err.message : undefined),
          });
        }}
        title="Cancel this session?"
        description="Your partner will be notified. This cannot be undone — you would need to schedule a new session."
        confirmLabel="Cancel session"
        destructive
        loading={deleteSession.isPending}
      />
    </PageContainer>
  );
}

/** One session row, used in the day detail, agenda and history lists. */
function SessionListItem({
  session,
  onEdit,
  onCancel,
}: {
  session: CalendarSession;
  onEdit?: () => void;
  onCancel?: () => void;
}) {
  const partner = session.exchange.participants.find((p) => p.username !== session.host.username);

  return (
    <li className={cn('flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4', session.status === 'CANCELLED' && 'opacity-70')}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-brand-soft text-brand-700 dark:text-brand-300">
          <span className="text-[10px] font-semibold uppercase leading-none">
            {new Date(session.startsAt).toLocaleDateString(undefined, { month: 'short' })}
          </span>
          <span className="font-display text-base font-bold leading-tight">{new Date(session.startsAt).getDate()}</span>
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{session.title ?? session.exchange.title}</p>
            {session.status === 'COMPLETED' ? (
              <Badge variant="success">Completed</Badge>
            ) : session.status === 'CANCELLED' ? (
              <Badge variant="neutral">Cancelled</Badge>
            ) : session.status === 'NO_SHOW' ? (
              <Badge variant="danger">No show</Badge>
            ) : (
              <Badge variant="info">Scheduled</Badge>
            )}
            <FormatBadge format={session.format} />
          </div>
          <p className="mt-1 text-sm ss-muted">
            {formatSessionTime(session.startsAt, session.timezone)} · {formatDuration(session.durationMinutes)}
          </p>
          {partner ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs ss-subtle">
              <Avatar name={partner.displayName} src={partner.avatarUrl} seed={partner.username} size="xs" />
              with {partner.displayName}
            </p>
          ) : null}
          {session.agenda ? <p className="mt-2 text-sm ss-muted">{session.agenda}</p> : null}
          {session.cancellationReason ? (
            <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">Cancelled: {session.cancellationReason}</p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {session.meetingUrl && session.status === 'SCHEDULED' ? (
          <a href={session.meetingUrl} target="_blank" rel="noreferrer noopener" className="ss-btn-secondary ss-btn-sm">
            <Video className="h-3.5 w-3.5" aria-hidden="true" />
            Join
          </a>
        ) : null}
        {onEdit && session.status === 'SCHEDULED' ? (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        {onCancel && session.status === 'SCHEDULED' ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
            onClick={onCancel}
            aria-label="Cancel session"
            leftIcon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Cancel
          </Button>
        ) : null}
        <Link
          to={`/exchanges/${session.exchange.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium ss-subtle hover:text-[rgb(var(--ss-text))]"
        >
          Workspace
        </Link>
      </div>
    </li>
  );
}
