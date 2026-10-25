import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Check,
  Clock,
  Inbox,
  MessageSquare,
  Send,
  Undo2,
  X,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, ExchangeStatusBadge, FormatBadge } from '@/components/ui/Badge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { Reveal } from '@/components/animations/Motion';
import { useExchangeRequests, useRespondToRequest } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn, formatDateTime, formatDuration, relativeTime } from '@/lib/utils';
import type { ExchangeRequestItem, SessionFormat } from '@/lib/types';

type Tab = 'incoming' | 'outgoing';

export default function ExchangeRequestsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('incoming');
  const { data: incoming, isLoading: loadingIn, isError, error, refetch } = useExchangeRequests('incoming');
  const { data: outgoing, isLoading: loadingOut } = useExchangeRequests('outgoing');
  const respond = useRespondToRequest();

  const [declining, setDeclining] = useState<ExchangeRequestItem | null>(null);
  const [withdrawing, setWithdrawing] = useState<ExchangeRequestItem | null>(null);
  const [countering, setCountering] = useState<ExchangeRequestItem | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const [counterMinutes, setCounterMinutes] = useState('60');
  const [counterPerWeek, setCounterPerWeek] = useState('1');
  const [counterTotal, setCounterTotal] = useState('6');
  const [counterFormat, setCounterFormat] = useState<SessionFormat>('ONLINE');
  const [counterMessage, setCounterMessage] = useState('');

  const list = tab === 'incoming' ? (incoming ?? []) : (outgoing ?? []);
  const isLoading = tab === 'incoming' ? loadingIn : loadingOut;
  const pendingCount = (incoming ?? []).filter((r) => r.status === 'PENDING').length;

  const accept = (request: ExchangeRequestItem) =>
    respond.mutate(
      { id: request.id, action: 'accept' },
      {
        onSuccess: () =>
          toast.success(
            'Exchange accepted',
            `The workspace with ${request.initiator.displayName} is ready. Schedule your first session.`,
          ),
        onError: (err) =>
          toast.error('Could not accept', err instanceof ApiError ? err.message : undefined),
      },
    );

  const openCounter = (request: ExchangeRequestItem) => {
    setCounterMinutes(String(request.terms.sessionMinutes));
    setCounterPerWeek(String(request.terms.sessionsPerWeek));
    setCounterTotal(String(request.terms.totalSessions));
    setCounterFormat(request.terms.preferredFormat);
    setCounterMessage('');
    setCountering(request);
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Exchange requests</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Requests move through a fixed lifecycle: pending, then accepted or declined, then active while you
            meet, then completed. Every status change is recorded.
          </p>
        </div>
        <Link to="/matches">
          <Button variant="secondary" leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}>
            Find new partners
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-xl border p-1" role="tablist" aria-label="Request direction">
        {(['incoming', 'outgoing'] as Tab[]).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            id={`tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              tab === value
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'ss-muted hover:bg-[rgb(var(--ss-border)/0.5)]',
            )}
          >
            {value === 'incoming' ? (
              <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            )}
            {value === 'incoming' ? 'Received' : 'Sent'}
            {value === 'incoming' && pendingCount > 0 ? (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6">
        {isError && tab === 'incoming' ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonRows count={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-7 w-7" aria-hidden="true" />}
            title={tab === 'incoming' ? 'No requests received' : 'No requests sent'}
            description={
              tab === 'incoming'
                ? 'When someone proposes an exchange with you, it will appear here for you to accept, decline or counter.'
                : 'Browse your matches and send your first proposal. A specific message gets a much better response.'
            }
            action={
              <Link to="/matches">
                <Button leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}>See your matches</Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-4">
            {list.map((request) => {
              const other = tab === 'incoming' ? request.initiator : request.recipient;
              const canRespond = tab === 'incoming' && request.status === 'PENDING';
              const canWithdraw = tab === 'outgoing' && request.status === 'PENDING';
              const canAcceptCounter = tab === 'outgoing' && request.status === 'COUNTERED';

              return (
                <Reveal key={request.id}>
                  <Card>
                    <CardBody className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Link to={`/members/${other.username}`} className="flex min-w-0 items-center gap-3">
                          <Avatar name={other.displayName} src={other.avatarUrl} seed={other.username} size="lg" />
                          <div className="min-w-0">
                            <p className="truncate font-display text-base font-semibold">{other.displayName}</p>
                            <p className="truncate text-xs ss-subtle">
                              @{other.username} · {tab === 'incoming' ? 'wants to exchange' : 'you proposed'} ·{' '}
                              {relativeTime(request.createdAt)}
                            </p>
                          </div>
                        </Link>
                        <ExchangeStatusBadge status={request.status} />
                      </div>

                      {/* The proposed trade */}
                      <div className="grid gap-3 rounded-xl border bg-[rgb(var(--ss-bg))] p-4 sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                            {tab === 'incoming' ? 'They offer' : 'You offer'}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.offeredSkill?.name ?? 'Not specified'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                            {tab === 'incoming' ? 'They want' : 'You want'}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {request.requestedSkill?.name ?? 'Not specified'}
                          </p>
                        </div>
                      </div>

                      {request.message ? (
                        <div className="flex items-start gap-2.5">
                          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 ss-subtle" aria-hidden="true" />
                          <p className="text-sm ss-muted">{request.message}</p>
                        </div>
                      ) : null}

                      {request.goals ? (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                            Agreed goal
                          </p>
                          <p className="mt-1 text-sm ss-muted">{request.goals}</p>
                        </div>
                      ) : null}

                      {/* Terms */}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="neutral" icon={<Clock className="h-3 w-3" aria-hidden="true" />}>
                          {formatDuration(request.terms.sessionMinutes)} per session
                        </Badge>
                        <Badge variant="neutral" icon={<Calendar className="h-3 w-3" aria-hidden="true" />}>
                          {request.terms.sessionsPerWeek}× per week · {request.terms.totalSessions} total
                        </Badge>
                        <FormatBadge format={request.terms.preferredFormat} />
                      </div>

                      {/* Status timeline */}
                      <div className="rounded-xl border bg-[rgb(var(--ss-bg))] p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                          Status timeline
                        </p>
                        <ol className="mt-2 space-y-2">
                          <li className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                            <span className="font-medium">Proposed</span>
                            <span className="ss-subtle">{formatDateTime(request.createdAt)}</span>
                          </li>
                          {request.respondedAt ? (
                            <li className="flex items-center gap-2 text-xs">
                              <span
                                className={cn(
                                  'h-2 w-2 rounded-full',
                                  request.status === 'DECLINED' || request.status === 'WITHDRAWN'
                                    ? 'bg-rose-500'
                                    : 'bg-emerald-500',
                                )}
                                aria-hidden="true"
                              />
                              <span className="font-medium">{request.statusLabel}</span>
                              <span className="ss-subtle">{formatDateTime(request.respondedAt)}</span>
                            </li>
                          ) : null}
                          {request.exchangeId ? (
                            <li className="flex items-center gap-2 text-xs">
                              <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                              <span className="font-medium">Exchange workspace created</span>
                              <Link
                                to={`/exchanges/${request.exchangeId}`}
                                className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
                              >
                                Open
                              </Link>
                            </li>
                          ) : null}
                        </ol>
                      </div>

                      {/* Actions */}
                      {(canRespond || canWithdraw || canAcceptCounter) && (
                        <div className="flex flex-wrap gap-2 border-t pt-4">
                          {canRespond ? (
                            <>
                              <Button
                                onClick={() => accept(request)}
                                loading={respond.isPending}
                                leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => openCounter(request)}
                                leftIcon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
                              >
                                Propose different terms
                              </Button>
                              <Button
                                variant="ghost"
                                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                onClick={() => {
                                  setDeclineReason('');
                                  setDeclining(request);
                                }}
                                leftIcon={<X className="h-4 w-4" aria-hidden="true" />}
                              >
                                Decline
                              </Button>
                            </>
                          ) : null}

                          {canAcceptCounter ? (
                            <>
                              <Button
                                onClick={() => accept(request)}
                                loading={respond.isPending}
                                leftIcon={<Check className="h-4 w-4" aria-hidden="true" />}
                              >
                                Accept new terms
                              </Button>
                              <Button
                                variant="ghost"
                                className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                onClick={() => {
                                  setDeclineReason('');
                                  setDeclining(request);
                                }}
                              >
                                Decline
                              </Button>
                            </>
                          ) : null}

                          {canWithdraw ? (
                            <Button
                              variant="ghost"
                              onClick={() => setWithdrawing(request)}
                              leftIcon={<Undo2 className="h-4 w-4" aria-hidden="true" />}
                            >
                              Withdraw request
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </Reveal>
              );
            })}
          </ul>
        )}
      </div>

      {/* Counter-proposal modal */}
      <Modal
        open={Boolean(countering)}
        onClose={() => setCountering(null)}
        title="Propose different terms"
        description="The other member will see your counter-proposal and can accept or decline it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCountering(null)}>
              Cancel
            </Button>
            <Button
              loading={respond.isPending}
              onClick={() => {
                if (!countering) return;
                respond.mutate(
                  {
                    id: countering.id,
                    action: 'counter',
                    message: counterMessage.trim() || undefined,
                    sessionMinutes: Number(counterMinutes),
                    sessionsPerWeek: Number(counterPerWeek),
                    totalSessions: Number(counterTotal),
                    preferredFormat: counterFormat,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Counter-proposal sent', 'They will be notified.');
                      setCountering(null);
                    },
                    onError: (err) =>
                      toast.error('Could not send', err instanceof ApiError ? err.message : undefined),
                  },
                );
              }}
            >
              Send counter-proposal
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Session length"
              value={counterMinutes}
              onChange={(event) => setCounterMinutes(event.target.value)}
              options={[30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }))}
            />
            <SelectField
              label="Per week"
              value={counterPerWeek}
              onChange={(event) => setCounterPerWeek(event.target.value)}
              options={[1, 2, 3].map((c) => ({ value: String(c), label: `${c}×` }))}
            />
            <SelectField
              label="Total sessions"
              value={counterTotal}
              onChange={(event) => setCounterTotal(event.target.value)}
              options={[2, 4, 6, 8, 12].map((c) => ({ value: String(c), label: String(c) }))}
            />
            <SelectField
              label="Format"
              value={counterFormat}
              onChange={(event) => setCounterFormat(event.target.value as SessionFormat)}
              options={[
                { value: 'ONLINE', label: 'Online' },
                { value: 'IN_PERSON', label: 'In person' },
                { value: 'EITHER', label: 'Either' },
              ]}
            />
          </div>
          <TextAreaField
            label="Why these terms?"
            value={counterMessage}
            onChange={(event) => setCounterMessage(event.target.value)}
            maxLength={1000}
            showCount
            placeholder="e.g. I can only manage 30 minutes on weekdays, but I am free at weekends."
          />
        </div>
      </Modal>

      {/* Decline dialog */}
      <Modal
        open={Boolean(declining)}
        onClose={() => setDeclining(null)}
        title="Decline this request?"
        description="A short reason is optional, but it is a kinder way to decline."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={respond.isPending}
              onClick={() => {
                if (!declining) return;
                respond.mutate(
                  { id: declining.id, action: 'decline', reason: declineReason.trim() || undefined },
                  {
                    onSuccess: () => {
                      toast.success('Request declined');
                      setDeclining(null);
                    },
                  },
                );
              }}
            >
              Decline request
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason (optional)"
          value={declineReason}
          onChange={(event) => setDeclineReason(event.target.value)}
          maxLength={500}
          showCount
          placeholder="e.g. I do not have capacity for a new exchange right now."
          hint="Shared with the other member."
        />
      </Modal>

      {/* Withdraw confirmation */}
      <ConfirmDialog
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(null)}
        onConfirm={() => {
          if (!withdrawing) return;
          respond.mutate(
            { id: withdrawing.id, action: 'withdraw' },
            {
              onSuccess: () => {
                toast.success('Request withdrawn');
                setWithdrawing(null);
              },
            },
          );
        }}
        title="Withdraw this request?"
        description="The other member will no longer see it as pending. You can send a new request later."
        confirmLabel="Withdraw"
        loading={respond.isPending}
      />
    </PageContainer>
  );
}
