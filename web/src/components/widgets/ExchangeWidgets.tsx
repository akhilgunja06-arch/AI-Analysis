import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, Handshake, Target, TrendingUp, Video } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Avatar, AvatarGroup } from '@/components/ui/Avatar';
import { Badge, ExchangeStatusBadge, SkillChip } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/animations/Motion';
import { formatDuration, formatNumber, formatSessionTime, pluralise, relativeTime } from '@/lib/utils';
import type { CalendarSession, ExchangeSummary, Match, MatchBreakdown } from '@/lib/types';

/** Compact card for an exchange in a list. */
export function ExchangeCard({ exchange }: { exchange: ExchangeSummary }) {
  const partner = exchange.participants.find((p) => !p.isMe) ?? exchange.participants[0];
  const progressPercent =
    exchange.progress.sessionsTotal > 0
      ? Math.round((exchange.progress.sessionsCompleted / exchange.progress.sessionsTotal) * 100)
      : 0;

  return (
    <Card interactive className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarGroup
            people={exchange.participants.map((p) => ({
              name: p.displayName,
              src: p.avatarUrl,
              username: p.username,
            }))}
            size="md"
          />
          <div className="min-w-0">
            <h3 className="truncate font-display text-sm font-semibold">
              {partner && !partner.isMe ? partner.displayName : exchange.title}
            </h3>
            <p className="truncate text-xs ss-subtle">
              {exchange.participants.length} {pluralise(exchange.participants.length, 'participant')}
            </p>
          </div>
        </div>
        <ExchangeStatusBadge status={exchange.status} />
      </div>

      {exchange.goals ? (
        <p className="ss-clamp-2 mt-3 flex-1 text-sm ss-muted">{exchange.goals}</p>
      ) : (
        <p className="mt-3 flex-1 text-sm ss-subtle">No goals recorded for this exchange.</p>
      )}

      <div className="mt-4 space-y-2">
        <ProgressBar
          value={progressPercent}
          label={`${exchange.progress.sessionsCompleted} of ${exchange.progress.sessionsTotal} sessions`}
          showValue
        />
        <p className="flex items-center gap-1.5 text-xs ss-subtle">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {exchange.progress.milestonesDone} of {exchange.progress.milestonesTotal} milestones complete
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3">
        <span className="text-xs ss-subtle">Updated {relativeTime(exchange.updatedAt)}</span>
        <Link
          to={`/exchanges/${exchange.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
        >
          Open workspace
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

/** Agenda row for an upcoming session. */
export function SessionRow({ session, showExchange = true }: { session: CalendarSession; showExchange?: boolean }) {
  const partner = session.exchange.participants.find((p) => p.username !== session.host.username);

  return (
    <li className="flex items-start gap-3 rounded-xl border p-4">
      <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-brand-soft text-brand-700 dark:text-brand-300">
        <span className="text-[10px] font-semibold uppercase leading-none">
          {new Date(session.startsAt).toLocaleDateString(undefined, { month: 'short' })}
        </span>
        <span className="font-display text-base font-bold leading-tight">
          {new Date(session.startsAt).getDate()}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">
            {session.title ?? (showExchange ? session.exchange.title : 'Learning session')}
          </p>
          {session.status === 'CANCELLED' ? (
            <Badge variant="neutral">Cancelled</Badge>
          ) : session.status === 'COMPLETED' ? (
            <Badge variant="success">Completed</Badge>
          ) : session.status === 'NO_SHOW' ? (
            <Badge variant="danger">No show</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs ss-muted">
          {formatSessionTime(session.startsAt, session.timezone)} · {formatDuration(session.durationMinutes)}
          {session.timezone ? ` · ${session.timezone.replace(/_/g, ' ')}` : ''}
        </p>
        {partner ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs ss-subtle">
            <Avatar name={partner.displayName} src={partner.avatarUrl} seed={partner.username} size="xs" />
            with {partner.displayName}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {session.meetingUrl && session.status === 'SCHEDULED' ? (
          <a
            href={session.meetingUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-[rgb(var(--ss-ring))]"
          >
            <Video className="h-3.5 w-3.5" aria-hidden="true" />
            Join
          </a>
        ) : null}
        <Link
          to="/calendar"
          className="inline-flex items-center gap-1 text-xs font-medium ss-subtle hover:text-[rgb(var(--ss-text))]"
        >
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          Calendar
        </Link>
      </div>
    </li>
  );
}

/**
 * Match card with the score breakdown shown in full. The explanation is the
 * point of the feature, so it is not hidden behind a tooltip.
 */
export function MatchCard({
  match,
  maxima,
  onDismiss,
  dismissing = false,
  actionSlot,
}: {
  match: Match;
  /**
   * Component ceilings, taken from the API's published weights. Defaults mirror
   * the server's WEIGHTS so a card still renders if criteria has not loaded.
   */
  maxima?: Partial<Record<keyof MatchBreakdown, number>>;
  onDismiss?: (userId: string) => void;
  dismissing?: boolean;
  actionSlot?: React.ReactNode;
}) {
  const rows = [
    { label: 'They teach what you want', value: match.breakdown.skillTeachToLearn, max: maxima?.skillTeachToLearn ?? 30 },
    { label: 'You teach what they want', value: match.breakdown.skillLearnToTeach, max: maxima?.skillLearnToTeach ?? 25 },
    { label: 'Shared language', value: match.breakdown.language, max: maxima?.language ?? 12 },
    { label: 'Timezone overlap', value: match.breakdown.timezone, max: maxima?.timezone ?? 10 },
    { label: 'Availability overlap', value: match.breakdown.availability, max: maxima?.availability ?? 13 },
    { label: 'Reputation', value: match.breakdown.reputation, max: maxima?.reputation ?? 10 },
  ];

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/members/${match.username}`} className="flex min-w-0 items-center gap-3">
          <Avatar
            name={match.profile?.displayName ?? match.username}
            src={match.profile?.avatarUrl}
            seed={match.username}
            size="lg"
          />
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold">
              {match.profile?.displayName ?? match.username}
            </h3>
            <p className="truncate text-xs ss-subtle">@{match.username}</p>
            {match.profile?.headline ? (
              <p className="ss-clamp-2 mt-1 text-xs ss-muted">{match.profile.headline}</p>
            ) : null}
          </div>
        </Link>

        <div className="shrink-0 text-right">
          <div className="inline-flex items-baseline gap-0.5 rounded-xl bg-gradient-brand px-2.5 py-1.5 text-white shadow-glow-sm">
            <span className="font-display text-lg font-bold tabular-nums">{match.score}</span>
            <span className="text-[10px] opacity-80">/100</span>
          </div>
        </div>
      </div>

      {match.theyTeachWhatIWant.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ss-subtle">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
            They can teach you
          </p>
          <div className="flex flex-wrap gap-1.5">
            {match.theyTeachWhatIWant.map((skill) => (
              <SkillChip key={skill.skillId} name={skill.skillName} tone="brand" />
            ))}
          </div>
        </div>
      ) : null}

      {match.iTeachWhatTheyWant.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ss-subtle">
            <Handshake className="h-3 w-3" aria-hidden="true" />
            You can teach them
          </p>
          <div className="flex flex-wrap gap-1.5">
            {match.iTeachWhatTheyWant.map((skill) => (
              <SkillChip key={skill.skillId} name={skill.skillName} tone="learn" />
            ))}
          </div>
        </div>
      ) : null}

      {/* Transparent score breakdown */}
      <details className="mt-4 rounded-xl border bg-[rgb(var(--ss-bg))] px-3 py-2.5">
        <summary className="cursor-pointer text-xs font-semibold">
          Why this score? ({match.score}/100)
        </summary>
        <dl className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between text-[11px]">
                <dt className="ss-muted">{row.label}</dt>
                <dd className="font-medium tabular-nums">
                  {formatNumber(row.value)} / {row.max}
                </dd>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--ss-border))]">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${row.max > 0 ? Math.min(100, (row.value / row.max) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] ss-subtle">
          Matching is deterministic arithmetic on the criteria above — no machine-learning model is involved.
        </p>
      </details>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-4">
        {actionSlot}
        <Link to={`/members/${match.username}`} className="ss-btn-secondary ss-btn-sm">
          View profile
        </Link>
        {onDismiss ? (
          <button
            type="button"
            onClick={() => onDismiss(match.userId)}
            disabled={dismissing}
            className="ss-btn-ghost ss-btn-sm ml-auto"
          >
            Not for me
          </button>
        ) : null}
      </div>
    </Card>
  );
}
