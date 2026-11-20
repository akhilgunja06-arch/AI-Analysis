import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, Video } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useCallHistory, useIntegrationStatus } from '@/hooks/queries';
import { useCall } from '@/providers/CallProvider';
import { cn, relativeTime } from '@/lib/utils';
import type { CallHistoryEntry } from '@/lib/types';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const STATUS_LABEL: Record<string, string> = {
  ENDED: 'Completed',
  REJECTED: 'Declined',
  MISSED: 'Missed',
  RINGING: 'Ringing',
  ACCEPTED: 'In progress',
  FAILED: 'Failed',
};

/**
 * Call history and a way to start a new call.
 *
 * The list is built from CallSession rows, so it only ever contains calls that
 * really happened between real accounts.
 */
export default function CallsPage() {
  const toast = useToast();
  const { data: history, isLoading, isError, error, refetch } = useCallHistory();
  const { data: integrations } = useIntegrationStatus();
  const { startCall, inCall, starting } = useCall();
  const [username, setUsername] = useState('');

  const webrtc = integrations?.webrtc;

  const begin = async (type: 'AUDIO' | 'VIDEO', target?: string) => {
    const handle = (target ?? username).trim().replace(/^@/, '');
    if (!handle) {
      toast.warning('Enter a username', 'Type the username of the member you want to call.');
      return;
    }
    await startCall(handle, type);
  };

  const rows: CallHistoryEntry[] = history ?? [];

  return (
    <PageContainer>
      <div>
        <h1 className="ss-heading-page flex items-center gap-2">
          <PhoneCall className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          Calls
        </h1>
        <p className="mt-2 max-w-2xl ss-muted">
          Start a one-to-one audio or video call with another member. Calls connect directly between the two
          browsers and are never recorded.
        </p>
      </div>

      {webrtc && !webrtc.turn ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-50/60 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/5 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            No TURN server is configured, so calls may fail on strict networks (some corporate or mobile
            networks). Set <code className="font-mono">WEBRTC_TURN_URLS</code> in{' '}
            <code className="font-mono">server/.env</code> to relay media when a direct connection is blocked.
          </p>
        </div>
      ) : null}

      <Card className="mt-6 p-4">
        <h2 className="text-sm font-semibold">Start a call</h2>
        <p className="mt-1 text-xs ss-muted">
          Enter the exact username of a registered member. Find one on the{' '}
          <Link to="/members" className="text-brand-600 underline underline-offset-2 dark:text-brand-400">
            members page
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="call-username" className="sr-only">
            Username to call
          </label>
          <input
            id="call-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="@username"
            className="ss-input w-full max-w-xs"
            autoComplete="off"
          />
          <Button
            onClick={() => void begin('AUDIO')}
            loading={starting}
            disabled={inCall}
            leftIcon={<Phone className="h-4 w-4" aria-hidden="true" />}
          >
            Audio call
          </Button>
          <Button
            variant="secondary"
            onClick={() => void begin('VIDEO')}
            loading={starting}
            disabled={inCall}
            leftIcon={<Video className="h-4 w-4" aria-hidden="true" />}
          >
            Video call
          </Button>
        </div>
        {inCall ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            You are already in a call. End it before starting another.
          </p>
        ) : null}
      </Card>

      <h2 className="mt-8 text-sm font-semibold">Call history</h2>

      {isLoading ? (
        <div className="mt-3">
          <LoadingState label="Loading calls" />
        </div>
      ) : isError ? (
        <div className="mt-3">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No calls yet"
            description="Calls you make and receive will appear here. Start one above, or open a member's profile."
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((call) => {
            const outgoing = call.direction === 'OUTGOING';
            return (
              <li key={call.id}>
                <Card className="flex flex-wrap items-center gap-3 p-3">
                  <Avatar
                    name={call.other.displayName}
                    src={call.other.avatarUrl}
                    seed={call.other.username}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/members/${call.other.username}`}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {call.other.displayName}
                      </Link>
                      <span className="truncate text-xs ss-subtle">@{call.other.username}</span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs ss-subtle">
                      {outgoing ? (
                        <PhoneOutgoing className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <PhoneIncoming className="h-3 w-3" aria-hidden="true" />
                      )}
                      {outgoing ? 'Outgoing' : 'Incoming'} · {call.type === 'VIDEO' ? 'Video' : 'Audio'} ·{' '}
                      {relativeTime(call.startedAt)}
                      {call.status === 'ENDED' ? ` · ${formatDuration(call.durationSeconds)}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                      call.status === 'ENDED'
                        ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                        : call.status === 'REJECTED' || call.status === 'MISSED' || call.status === 'FAILED'
                          ? 'bg-rose-500/12 text-rose-700 dark:text-rose-400'
                          : 'bg-[rgb(var(--ss-border)/0.6)] text-[rgb(var(--ss-text-muted))]',
                    )}
                  >
                    {STATUS_LABEL[call.status] ?? call.status}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void begin('AUDIO', call.other.username)}
                      disabled={inCall}
                      className={cn(
                        'rounded-lg border p-2 transition-colors hover:bg-[rgb(var(--ss-border)/0.5)]',
                        inCall && 'cursor-not-allowed opacity-50',
                      )}
                      aria-label={`Call ${call.other.displayName} by audio`}
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void begin('VIDEO', call.other.username)}
                      disabled={inCall}
                      className={cn(
                        'rounded-lg border p-2 transition-colors hover:bg-[rgb(var(--ss-border)/0.5)]',
                        inCall && 'cursor-not-allowed opacity-50',
                      )}
                      aria-label={`Call ${call.other.displayName} by video`}
                    >
                      <Video className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
