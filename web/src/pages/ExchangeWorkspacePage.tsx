import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Flag,
  History,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Star,
  StickyNote,
  Target,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar, AvatarGroup } from '@/components/ui/Avatar';
import { Badge, ExchangeStatusBadge, FormatBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { ProgressBar } from '@/components/animations/Motion';
import {
  useConfirmCompletion,
  useCreateMilestone,
  useCreateNote,
  useCreateReview,
  useCreateSession,
  useDeleteMilestone,
  useDeleteNote,
  useExchangeAction,
  useExchangeWorkspace,
  useUpdateMilestone,
} from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { cn, formatDateTime, formatDuration, formatSessionTime, pluralise, relativeTime } from '@/lib/utils';
import type { SessionFormat } from '@/lib/types';

export default function ExchangeWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const { data, isLoading, isError, error, refetch } = useExchangeWorkspace(id);
  const exchangeAction = useExchangeAction();
  const confirmCompletion = useConfirmCompletion();
  const createSession = useCreateSession();
  const createMilestone = useCreateMilestone();
  const updateMilestone = useUpdateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const createReview = useCreateReview();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [sessionOpen, setSessionOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Session form
  const [sessionDate, setSessionDate] = useState('');
  const [sessionTime, setSessionTime] = useState('18:00');
  const [sessionDuration, setSessionDuration] = useState('60');
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionAgenda, setSessionAgenda] = useState('');
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>('ONLINE');
  const [meetingUrl, setMeetingUrl] = useState('');

  // Milestone form
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDescription, setMilestoneDescription] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');

  // Note form
  const [noteBody, setNoteBody] = useState('');
  const [noteUrl, setNoteUrl] = useState('');

  // Review form
  const [rating, setRating] = useState(5);
  const [teachingRating, setTeachingRating] = useState(5);
  const [communicationRating, setCommunicationRating] = useState(5);
  const [reliabilityRating, setReliabilityRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Opening the exchange" />
      </PageContainer>
    );
  }

  if (isError || !data) {
    const forbidden = error instanceof ApiError && error.isForbidden;
    const notFound = error instanceof ApiError && error.isNotFound;
    return (
      <PageContainer>
        {forbidden || notFound ? (
          <EmptyState
            icon={<Users className="h-7 w-7" aria-hidden="true" />}
            title="You cannot open this exchange"
            description="Only the two participants in an exchange can see its workspace, sessions and notes."
            action={
              <Link to="/exchanges">
                <Button>Back to my exchanges</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}
      </PageContainer>
    );
  }

  const { exchange, sessions, milestones, notes, timeline, permissions, progress, reviews } = data;
  const me = exchange.participants.find((p) => p.isMe);
  const partner = exchange.participants.find((p) => !p.isMe) ?? exchange.participants[0];
  const isClosed = ['COMPLETED', 'CANCELLED', 'DECLINED', 'WITHDRAWN'].includes(exchange.status);

  const runAction = (action: string, reason?: string) =>
    exchangeAction.mutate(
      { id: exchange.id, action, reason },
      {
        onSuccess: () => toast.success('Exchange updated', `Status is now ${action}.`),
        onError: (err) =>
          toast.error('Could not update the exchange', err instanceof ApiError ? err.message : undefined),
      },
    );

  const scheduleSession = async () => {
    if (!sessionDate) {
      toast.error('Pick a date', 'A session needs a date and time.');
      return;
    }
    const startsAt = new Date(`${sessionDate}T${sessionTime}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      toast.error('That date and time is not valid');
      return;
    }
    try {
      await createSession.mutateAsync({
        exchangeId: exchange.id,
        startsAt: startsAt.toISOString(),
        durationMinutes: Number(sessionDuration),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        format: sessionFormat,
        meetingUrl: meetingUrl.trim() || undefined,
        title: sessionTitle.trim() || undefined,
        agenda: sessionAgenda.trim() || undefined,
      });
      toast.success('Session scheduled', 'Both participants can see it on the calendar.');
      setSessionOpen(false);
      setSessionTitle('');
      setSessionAgenda('');
      setMeetingUrl('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SCHEDULE_CONFLICT') {
        toast.error('That time is already taken', 'One of you has another session in that window.');
      } else {
        toast.error('Could not schedule', err instanceof ApiError ? err.message : undefined);
      }
    }
  };

  const submitReview = async () => {
    if (!partner) return;
    try {
      await createReview.mutateAsync({
        exchangeId: exchange.id,
        subjectId: partner.userId,
        rating,
        teachingRating,
        communicationRating,
        reliabilityRating,
        comment: reviewComment.trim() || undefined,
      });
      toast.success('Review submitted', `Thanks — your feedback for ${partner.displayName} is live.`);
      setReviewOpen(false);
    } catch (err) {
      toast.error('Could not submit the review', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <PageContainer>
      <button
        type="button"
        onClick={() => navigate('/exchanges')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm ss-muted transition-colors hover:text-[rgb(var(--ss-text))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All exchanges
      </button>

      {/* ------------------------------------------------------- header */}
      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <AvatarGroup
                people={exchange.participants.map((p) => ({
                  name: p.displayName,
                  src: p.avatarUrl,
                  username: p.username,
                }))}
                size="lg"
              />
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-bold">{exchange.title}</h1>
                <p className="mt-0.5 text-sm ss-subtle">
                  Started {exchange.startedAt ? relativeTime(exchange.startedAt) : 'not yet started'}
                  {exchange.completedAt ? ` · completed ${relativeTime(exchange.completedAt)}` : ''}
                </p>
              </div>
            </div>
            <ExchangeStatusBadge status={exchange.status} />
          </div>

          {exchange.goals ? (
            <div className="rounded-xl border bg-[rgb(var(--ss-bg))] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">Agreed goal</p>
              <p className="mt-1 text-sm ss-muted">{exchange.goals}</p>
            </div>
          ) : null}

          {/* Who teaches what */}
          <div className="grid gap-3 sm:grid-cols-2">
            {exchange.participants.map((participant) => (
              <div key={participant.userId} className="rounded-xl border p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={participant.displayName}
                    src={participant.avatarUrl}
                    seed={participant.username}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {participant.isMe ? 'You' : participant.displayName}
                      {participant.role === 'INITIATOR' ? (
                        <span className="ml-1.5 text-xs font-normal ss-subtle">(proposed it)</span>
                      ) : null}
                    </p>
                    <p className="text-xs ss-subtle">{participant.timezone?.replace(/_/g, ' ') ?? 'Timezone not set'}</p>
                  </div>
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline gap-2">
                    <dt className="text-xs ss-subtle">Teaches</dt>
                    <dd className="font-medium">{participant.teaches?.name ?? '—'}</dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="text-xs ss-subtle">Learns</dt>
                    <dd className="font-medium">{participant.learns?.name ?? '—'}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant={participant.status === 'COMPLETED' ? 'success' : 'neutral'}>
                    {participant.status.toLowerCase()}
                  </Badge>
                  {participant.completedAt ? (
                    <Badge variant="brand">confirmed {relativeTime(participant.completedAt)}</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="space-y-3">
            <ProgressBar value={progress.percent} label="Overall progress" showValue tone="brand" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border p-3">
                <p className="text-xs ss-subtle">Sessions done</p>
                <p className="mt-0.5 font-display text-lg font-bold tabular-nums">
                  {progress.sessionsCompleted}
                  <span className="text-sm font-normal ss-subtle">/{progress.sessionsTotal}</span>
                </p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs ss-subtle">Scheduled</p>
                <p className="mt-0.5 font-display text-lg font-bold tabular-nums">{progress.sessionsScheduled}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs ss-subtle">Milestones</p>
                <p className="mt-0.5 font-display text-lg font-bold tabular-nums">
                  {progress.milestonesDone}
                  <span className="text-sm font-normal ss-subtle">/{progress.milestonesTotal}</span>
                </p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs ss-subtle">Terms</p>
                <p className="mt-0.5 text-sm font-semibold">
                  {formatDuration(exchange.sessionMinutes)} · {exchange.totalSessions}×
                </p>
                <FormatBadge format={exchange.preferredFormat} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {permissions.availableActions.includes('start') ? (
              <Button
                onClick={() => runAction('start')}
                loading={exchangeAction.isPending}
                leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
              >
                Start exchange
              </Button>
            ) : null}

            {permissions.availableActions.includes('pause') ? (
              <Button
                variant="secondary"
                onClick={() => runAction('pause')}
                loading={exchangeAction.isPending}
                leftIcon={<Pause className="h-4 w-4" aria-hidden="true" />}
              >
                Pause
              </Button>
            ) : null}

            {permissions.availableActions.includes('resume') ? (
              <Button
                variant="secondary"
                onClick={() => runAction('resume')}
                loading={exchangeAction.isPending}
                leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
              >
                Resume
              </Button>
            ) : null}

            {!isClosed ? (
              <Button
                variant="secondary"
                onClick={() => setSessionOpen(true)}
                leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
              >
                Schedule session
              </Button>
            ) : null}

            {permissions.canConfirmCompletion && !permissions.bothConfirmed ? (
              <Button
                onClick={() =>
                  confirmCompletion.mutate(
                    { id: exchange.id, confirm: !permissions.myCompletionConfirmed },
                    {
                      onSuccess: (result) => {
                        if (result.data.bothConfirmed) {
                          toast.success('Exchange completed', 'You can both leave a review now.');
                        } else if (permissions.myCompletionConfirmed) {
                          toast.info('Confirmation withdrawn', 'The exchange stays active until you both confirm.');
                        } else {
                          toast.success('Completion confirmed', 'Waiting for your partner to confirm too.');
                        }
                      },
                    },
                  )
                }
                loading={confirmCompletion.isPending}
                leftIcon={
                  permissions.myCompletionConfirmed ? (
                    <X className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )
                }
              >
                {permissions.myCompletionConfirmed
                  ? 'Withdraw my confirmation'
                  : 'Confirm I have finished'}
              </Button>
            ) : null}

            {exchange.status === 'COMPLETED' && reviews.canReview ? (
              <Button onClick={() => setReviewOpen(true)} leftIcon={<Star className="h-4 w-4" aria-hidden="true" />}>
                Leave a review
              </Button>
            ) : null}

            {!isClosed ? (
              <Button
                variant="ghost"
                className="ml-auto text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                onClick={() => setCancelOpen(true)}
                leftIcon={<Flag className="h-4 w-4" aria-hidden="true" />}
              >
                Cancel exchange
              </Button>
            ) : null}

            <Link to="/messages">
              <Button variant="ghost" leftIcon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}>
                Message partner
              </Button>
            </Link>
          </div>

          {permissions.canConfirmCompletion && !permissions.bothConfirmed ? (
            <p className="rounded-xl border border-brand-500/30 bg-brand-50/50 px-4 py-3 text-sm dark:bg-brand-500/5">
              <strong>Completion needs both of you.</strong>{' '}
              {permissions.myCompletionConfirmed
                ? `You have confirmed. Waiting for ${partner?.displayName ?? 'your partner'}.`
                : 'Confirm when you are satisfied the agreed goals are met. The exchange moves to completed once you both do.'}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ------------------------------------------------ sessions */}
          <Card>
            <CardHeader
              title="Sessions"
              description={`${sessions.length} ${pluralise(sessions.length, 'session')} recorded`}
              icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
              action={
                !isClosed ? (
                  <Button size="sm" variant="secondary" onClick={() => setSessionOpen(true)}>
                    Schedule
                  </Button>
                ) : null
              }
            />
            <CardBody>
              {sessions.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Calendar className="h-6 w-6" aria-hidden="true" />}
                  title="No sessions yet"
                  description="Schedule the first one. Times are checked against both participants' calendars."
                  action={
                    !isClosed ? (
                      <Button size="sm" onClick={() => setSessionOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Schedule a session
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {sessions.map((session) => (
                    <li
                      key={session.id}
                      className={cn(
                        'flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4',
                        session.status === 'CANCELLED' && 'opacity-70',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{session.title ?? 'Learning session'}</p>
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
                          {formatSessionTime(session.startsAt, session.timezone)} · {formatDuration(session.endsAt ? (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000 : exchange.sessionMinutes)}
                        </p>
                        <p className="mt-0.5 text-xs ss-subtle">
                          Hosted by {session.isMine ? 'you' : session.hostDisplayName}
                        </p>
                        {session.agenda ? (
                          <p className="mt-2 text-sm ss-muted">{session.agenda}</p>
                        ) : null}
                        {session.cancellationReason ? (
                          <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                            Cancelled: {session.cancellationReason}
                          </p>
                        ) : null}
                      </div>
                      {session.meetingUrl && session.status === 'SCHEDULED' ? (
                        <a
                          href={session.meetingUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="ss-btn-secondary ss-btn-sm"
                        >
                          <Video className="h-3.5 w-3.5" aria-hidden="true" />
                          Join
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* ---------------------------------------------- milestones */}
          <Card>
            <CardHeader
              title="Milestones"
              description="Agree what success looks like, then tick them off."
              icon={<Target className="h-4 w-4" aria-hidden="true" />}
              action={
                !isClosed ? (
                  <Button size="sm" variant="secondary" onClick={() => setMilestoneOpen(true)}>
                    Add
                  </Button>
                ) : null
              }
            />
            <CardBody>
              {milestones.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Target className="h-6 w-6" aria-hidden="true" />}
                  title="No milestones yet"
                  description="Milestones break the goal into steps both of you can see progress against."
                  action={
                    !isClosed ? (
                      <Button size="sm" onClick={() => setMilestoneOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Add the first milestone
                      </Button>
                    ) : null
                  }
                />
              ) : (
                <ul className="space-y-2.5">
                  {milestones.map((milestone) => (
                    <li key={milestone.id} className="flex items-start gap-3 rounded-xl border p-4">
                      <button
                        type="button"
                        disabled={isClosed}
                        onClick={() =>
                          updateMilestone.mutate(
                            {
                              id: milestone.id,
                              exchangeId: exchange.id,
                              status: milestone.status === 'DONE' ? 'PENDING' : 'DONE',
                            },
                            {
                              onSuccess: () =>
                                toast.success(
                                  milestone.status === 'DONE' ? 'Reopened' : 'Milestone complete',
                                  milestone.title,
                                ),
                            },
                          )
                        }
                        aria-label={milestone.status === 'DONE' ? `Reopen ${milestone.title}` : `Mark ${milestone.title} done`}
                        className="mt-0.5 shrink-0 disabled:opacity-60"
                      >
                        {milestone.status === 'DONE' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <Circle className="h-5 w-5 ss-subtle" aria-hidden="true" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn('font-medium', milestone.status === 'DONE' && 'line-through ss-subtle')}>
                          {milestone.title}
                        </p>
                        {milestone.description ? (
                          <p className="mt-1 text-sm ss-muted">{milestone.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs ss-subtle">
                          Added by {milestone.authorDisplayName}
                          {milestone.dueAt ? ` · due ${formatDateTime(milestone.dueAt)}` : ''}
                          {milestone.completedAt ? ` · done ${relativeTime(milestone.completedAt)}` : ''}
                        </p>
                      </div>
                      {!isClosed ? (
                        <button
                          type="button"
                          onClick={() =>
                            deleteMilestone.mutate(
                              { id: milestone.id, exchangeId: exchange.id },
                              { onSuccess: () => toast.success('Milestone removed') },
                            )
                          }
                          aria-label={`Delete ${milestone.title}`}
                          className="shrink-0 rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* --------------------------------------------------- notes */}
          <Card>
            <CardHeader
              title="Shared notes and resources"
              description="Both participants can read and add to this."
              icon={<StickyNote className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody className="space-y-4">
              {!isClosed ? (
                <div className="space-y-3 rounded-xl border bg-[rgb(var(--ss-bg))] p-4">
                  <TextAreaField
                    label="Add a note"
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    maxLength={2000}
                    showCount
                    placeholder="What did you cover? What should we pick up next time?"
                  />
                  <TextField
                    label="Resource link (optional)"
                    type="url"
                    value={noteUrl}
                    onChange={(event) => setNoteUrl(event.target.value)}
                    placeholder="https://…"
                  />
                  <Button
                    size="sm"
                    loading={createNote.isPending}
                    disabled={noteBody.trim().length === 0}
                    onClick={() =>
                      createNote.mutate(
                        {
                          exchangeId: exchange.id,
                          body: noteBody.trim(),
                          resourceUrl: noteUrl.trim() || undefined,
                        },
                        {
                          onSuccess: () => {
                            toast.success('Note added');
                            setNoteBody('');
                            setNoteUrl('');
                          },
                        },
                      )
                    }
                    leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    Add note
                  </Button>
                </div>
              ) : null}

              {notes.length === 0 ? (
                <EmptyState
                  compact
                  icon={<StickyNote className="h-6 w-6" aria-hidden="true" />}
                  title="No notes yet"
                  description="Notes are a good place to keep a running summary and links to resources."
                />
              ) : (
                <ul className="space-y-3">
                  {notes.map((note) => (
                    <li key={note.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            name={note.author.displayName}
                            src={note.author.avatarUrl}
                            seed={note.author.username}
                            size="sm"
                          />
                          <div>
                            <p className="text-sm font-medium">{note.author.displayName}</p>
                            <p className="text-xs ss-subtle">{relativeTime(note.createdAt)}</p>
                          </div>
                        </div>
                        {note.author.username === user?.username && !isClosed ? (
                          <button
                            type="button"
                            onClick={() =>
                              deleteNote.mutate(
                                { id: note.id, exchangeId: exchange.id },
                                { onSuccess: () => toast.success('Note deleted') },
                              )
                            }
                            aria-label="Delete note"
                            className="rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-3 whitespace-pre-line text-sm ss-muted">{note.body}</p>
                      {note.resourceUrl ? (
                        <a
                          href={note.resourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 inline-flex items-center gap-1.5 break-all text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          {note.resourceUrl}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ---------------------------------------------------- sidebar */}
        <div className="space-y-6">
          {/* Reviews */}
          <Card>
            <CardHeader
              title="Feedback"
              description="One review per person, only after completion."
              icon={<Star className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody className="space-y-3">
              <div className="rounded-xl border p-3.5">
                <p className="text-xs ss-subtle">Your review</p>
                {reviews.mine ? (
                  <>
                    <p className="mt-1 text-sm font-semibold">{reviews.mine.rating}/5</p>
                    {reviews.mine.comment ? (
                      <p className="mt-1 text-sm ss-muted">{reviews.mine.comment}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-sm ss-subtle">Not written yet.</p>
                )}
              </div>
              <div className="rounded-xl border p-3.5">
                <p className="text-xs ss-subtle">{partner?.displayName ?? 'Partner'}&#39;s review</p>
                {reviews.theirs ? (
                  <>
                    <p className="mt-1 text-sm font-semibold">{reviews.theirs.rating}/5</p>
                    {reviews.theirs.comment ? (
                      <p className="mt-1 text-sm ss-muted">{reviews.theirs.comment}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-1 text-sm ss-subtle">Not written yet.</p>
                )}
              </div>
              {reviews.canReview ? (
                <Button fullWidth onClick={() => setReviewOpen(true)} leftIcon={<Star className="h-4 w-4" aria-hidden="true" />}>
                  Write your review
                </Button>
              ) : null}
            </CardBody>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader
              title="History"
              description="Every recorded change to this exchange."
              icon={<History className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {timeline.length === 0 ? (
                <p className="text-sm ss-subtle">No recorded events yet.</p>
              ) : (
                <ol className="space-y-3">
                  {timeline.map((event) => (
                    <li key={event.id} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm">{event.summary}</p>
                        <p className="text-xs ss-subtle">
                          {formatDateTime(event.createdAt)}
                          {event.actorId === me?.userId ? ' · by you' : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          {/* Closed notice */}
          {isClosed ? (
            <Card className="border-amber-500/35 bg-amber-50/50 dark:bg-amber-500/5">
              <CardBody>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <div className="text-sm">
                    <p className="font-semibold">This exchange is {exchange.status.toLowerCase()}</p>
                    <p className="mt-1 ss-muted">
                      {exchange.cancellationReason
                        ? exchange.cancellationReason
                        : 'Sessions, milestones and notes are now read-only. The history stays available to both of you.'}
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------- modals */}
      <Modal
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        title="Schedule a session"
        description="The server checks both calendars for clashes before booking."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSessionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={scheduleSession} loading={createSession.isPending}>
              Schedule
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Date"
              type="date"
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
              required
            />
            <TextField
              label="Start time"
              type="time"
              value={sessionTime}
              onChange={(event) => setSessionTime(event.target.value)}
              required
            />
            <SelectField
              label="Duration"
              value={sessionDuration}
              onChange={(event) => setSessionDuration(event.target.value)}
              options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }))}
            />
          </div>
          <TextField
            label="Topic"
            value={sessionTitle}
            onChange={(event) => setSessionTitle(event.target.value)}
            maxLength={120}
            placeholder="e.g. Generics and narrowing"
          />
          <TextAreaField
            label="Agenda"
            value={sessionAgenda}
            onChange={(event) => setSessionAgenda(event.target.value)}
            maxLength={500}
            showCount
            placeholder="What will you cover, and what should each of you prepare?"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Format"
              value={sessionFormat}
              onChange={(event) => setSessionFormat(event.target.value as SessionFormat)}
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
              onChange={(event) => setMeetingUrl(event.target.value)}
              placeholder="https://meet.example.com/…"
              hint="Optional. Only visible to the two participants."
            />
          </div>
          <p className="text-xs ss-subtle">
            <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Your local timezone is used. Your partner will see it converted to theirs.
          </p>
        </div>
      </Modal>

      <Modal
        open={milestoneOpen}
        onClose={() => setMilestoneOpen(false)}
        title="Add a milestone"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMilestoneOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createMilestone.isPending}
              disabled={milestoneTitle.trim().length === 0}
              onClick={() =>
                createMilestone.mutate(
                  {
                    exchangeId: exchange.id,
                    title: milestoneTitle.trim(),
                    description: milestoneDescription.trim() || undefined,
                    dueAt: milestoneDue ? new Date(milestoneDue).toISOString() : undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Milestone added');
                      setMilestoneOpen(false);
                      setMilestoneTitle('');
                      setMilestoneDescription('');
                      setMilestoneDue('');
                    },
                  },
                )
              }
            >
              Add milestone
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="What needs to happen?"
            value={milestoneTitle}
            onChange={(event) => setMilestoneTitle(event.target.value)}
            maxLength={160}
            required
            placeholder="e.g. Understand generics and narrowing"
          />
          <TextAreaField
            label="Detail"
            value={milestoneDescription}
            onChange={(event) => setMilestoneDescription(event.target.value)}
            maxLength={500}
            showCount
          />
          <TextField
            label="Target date"
            type="date"
            value={milestoneDue}
            onChange={(event) => setMilestoneDue(event.target.value)}
            hint="Optional."
          />
        </div>
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={`Review ${partner?.displayName ?? 'your partner'}`}
        description="Reviews are public and tied to this completed exchange. You can only review each partner once."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitReview} loading={createReview.isPending}>
              Submit review
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <RatingInput label="Overall" value={rating} onChange={setRating} />
          <RatingInput label="Teaching quality" value={teachingRating} onChange={setTeachingRating} />
          <RatingInput label="Communication" value={communicationRating} onChange={setCommunicationRating} />
          <RatingInput label="Reliability" value={reliabilityRating} onChange={setReliabilityRating} />
          <TextAreaField
            label="Written feedback"
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            maxLength={2000}
            showCount
            placeholder="What went well? What could have been better? Be fair and specific."
            hint="Visible on the other member's public profile."
          />
        </div>
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this exchange?"
        description="Both participants will be notified. The workspace becomes read-only and the history is kept."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={exchangeAction.isPending}
              onClick={() => {
                runAction('cancel', cancelReason.trim() || undefined);
                setCancelOpen(false);
              }}
            >
              Cancel exchange
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason (optional)"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          maxLength={500}
          showCount
          placeholder="e.g. Our schedules no longer line up."
        />
      </Modal>

    </PageContainer>
  );
}

/** Star rating control with an accessible radio group. */
function RatingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <fieldset>
      <legend className="ss-label">{label}</legend>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${score} out of 5`}
            onClick={() => onChange(score)}
            className="rounded p-1 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                'h-6 w-6',
                score <= value ? 'fill-amber-400 text-amber-400' : 'text-[rgb(var(--ss-border-strong))]',
              )}
              aria-hidden="true"
            />
          </button>
        ))}
        <span className="ml-2 text-sm font-medium">{value}/5</span>
      </div>
    </fieldset>
  );
}
