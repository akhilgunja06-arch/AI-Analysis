import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  GraduationCap,
  Lightbulb,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { ExchangeStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { AnimatedCounter, ProgressBar, ProgressRing } from '@/components/animations/Motion';
import { ActivityAreaChart, LearningBarChart } from '@/components/widgets/Charts';
import { useLearning } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { cn, formatDate, formatNumber, pluralise, relativeTime } from '@/lib/utils';

type Scope = 'all' | 'active' | 'completed';

export default function LearningPage() {
  const { profile } = useAuth();
  const [scope, setScope] = useState<Scope>('all');
  const { data, isLoading, isError, error, refetch } = useLearning(scope);

  const exportReport = () => {
    if (!data) return;
    // Built from the same data the page renders, so the file cannot disagree
    // with what is on screen.
    const lines: string[] = [
      `SkillSpring learning report for ${profile?.displayName ?? 'member'}`,
      `Generated ${new Date().toISOString()}`,
      '',
      `Active exchanges: ${data.summary.activeExchanges}`,
      `Completed exchanges: ${data.summary.completedExchanges}`,
      `Completed sessions: ${data.summary.totalSessionsCompleted}`,
      `Learning minutes recorded: ${data.summary.totalLearningMinutes}`,
      `Milestones completed: ${data.summary.totalMilestonesDone}`,
      '',
      'Exchanges',
      '---------',
    ];

    for (const item of data.exchanges) {
      lines.push(
        '',
        `${item.title} [${item.status}]`,
        `  Partner: ${item.partner?.displayName ?? '—'}`,
        `  You teach: ${item.iTeach?.name ?? '—'}`,
        `  You learn: ${item.iLearn?.name ?? '—'}`,
        `  Sessions: ${item.progress.sessionsCompleted}/${item.progress.sessionsTotal}`,
        `  Milestones: ${item.progress.milestonesDone}/${item.progress.milestonesTotal}`,
        `  Progress: ${item.progress.percent}%`,
      );
      for (const milestone of item.milestones) {
        lines.push(`    [${milestone.status === 'DONE' ? 'x' : ' '}] ${milestone.title}`);
      }
    }

    lines.push('', 'Weekly activity', '---------------');
    for (const point of data.weeklyActivity) {
      lines.push(`${point.label}: ${point.minutes} minutes across ${point.sessions} sessions`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `skillspring-learning-report-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Learning progress</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Everything here is counted from sessions and milestones you and your partners actually recorded —
            nothing is estimated.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={exportReport}
          disabled={!data || isLoading}
          leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
        >
          Download report
        </Button>
      </div>

      {/* Scope tabs */}
      <div className="mt-6 flex gap-1 rounded-xl border p-1" role="tablist" aria-label="Learning scope">
        {(['all', 'active', 'completed'] as Scope[]).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors',
              scope === value
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'ss-muted hover:bg-[rgb(var(--ss-border)/0.5)]',
            )}
          >
            {value === 'all' ? 'All' : value === 'active' ? 'In progress' : 'Completed'}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <LoadingState label="Loading your learning record" />
      ) : (
        <>
          {/* Summary */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="In progress"
              value={<AnimatedCounter value={data.summary.activeExchanges} />}
              hint="Active exchanges"
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              tone="emerald"
            />
            <StatCard
              label="Completed"
              value={<AnimatedCounter value={data.summary.completedExchanges} />}
              hint="Finished exchanges"
              icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
              tone="brand"
            />
            <StatCard
              label="Sessions held"
              value={<AnimatedCounter value={data.summary.totalSessionsCompleted} />}
              hint={`${formatNumber(data.summary.totalLearningMinutes)} minutes recorded`}
              icon={<Clock className="h-5 w-5" aria-hidden="true" />}
              tone="violet"
            />
            <StatCard
              label="Milestones"
              value={<AnimatedCounter value={data.summary.totalMilestonesDone} />}
              hint="Marked complete"
              icon={<Target className="h-5 w-5" aria-hidden="true" />}
              tone="amber"
            />
          </div>

          {/* Charts */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Weekly learning time"
                description="Minutes from completed sessions, by week."
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <LearningBarChart data={data.weeklyActivity} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Activity over time"
                description="Sessions and recorded events per week."
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <ActivityAreaChart
                  data={data.weeklyActivity.map((point) => ({ label: point.label, count: point.sessions }))}
                  unit="sessions"
                  emptyMessage="Nothing recorded yet. Completed sessions will appear here."
                />
              </CardBody>
            </Card>
          </div>

          {/* Exchanges */}
          <div className="mt-6 space-y-6">
            {data.exchanges.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-7 w-7" aria-hidden="true" />}
                title={scope === 'completed' ? 'No completed exchanges yet' : 'Nothing to show yet'}
                description={
                  scope === 'completed'
                    ? 'Once you and a partner both confirm an exchange is finished, it moves here with its full history.'
                    : 'Start an exchange and your learning record will build up as you record sessions and milestones.'
                }
                action={
                  <Link to="/matches">
                    <Button>Find a partner</Button>
                  </Link>
                }
              />
            ) : (
              data.exchanges.map((item) => (
                <Card key={item.exchangeId}>
                  <CardBody className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <Avatar
                          name={item.partner?.displayName ?? 'Partner'}
                          src={item.partner?.avatarUrl}
                          seed={item.partner?.username}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <h2 className="truncate font-display text-base font-semibold">{item.title}</h2>
                          <p className="truncate text-xs ss-subtle">
                            with {item.partner?.displayName ?? 'a partner'}
                            {item.startedAt ? ` · started ${formatDate(item.startedAt)}` : ''}
                            {item.completedAt ? ` · completed ${formatDate(item.completedAt)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <ExchangeStatusBadge status={item.status} />
                        <ProgressRing value={item.progress.percent} size={64} strokeWidth={6} label="Exchange progress" />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">You teach</p>
                        <p className="mt-1 text-sm font-medium">{item.iTeach?.name ?? '—'}</p>
                      </div>
                      <div className="rounded-xl border p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">You learn</p>
                        <p className="mt-1 text-sm font-medium">{item.iLearn?.name ?? '—'}</p>
                      </div>
                    </div>

                    {item.goals ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">Agreed goal</p>
                        <p className="mt-1 text-sm ss-muted">{item.goals}</p>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <ProgressBar
                        value={item.progress.percent}
                        label={`${item.progress.sessionsCompleted} of ${item.progress.sessionsTotal} sessions · ${item.progress.milestonesDone} of ${item.progress.milestonesTotal} milestones`}
                        showValue
                      />
                    </div>

                    {item.milestones.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">Milestones</p>
                        <ul className="mt-2 space-y-1.5">
                          {item.milestones.map((milestone) => (
                            <li key={milestone.id} className="flex items-start gap-2 text-sm">
                              {milestone.status === 'DONE' ? (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                              ) : (
                                <Circle className="mt-0.5 h-4 w-4 shrink-0 ss-subtle" aria-hidden="true" />
                              )}
                              <span className={cn(milestone.status === 'DONE' && 'ss-subtle line-through')}>
                                {milestone.title}
                                {milestone.completedAt ? (
                                  <span className="ml-1.5 text-xs ss-subtle">
                                    ({relativeTime(milestone.completedAt)})
                                  </span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {item.notes.length > 0 ? (
                      <details className="rounded-xl border bg-[rgb(var(--ss-bg))] p-3.5">
                        <summary className="cursor-pointer text-xs font-semibold">
                          Personal notes ({item.notes.length})
                        </summary>
                        <ul className="mt-3 space-y-3">
                          {item.notes.map((note) => (
                            <li key={note.id} className="border-l-2 border-brand-500/40 pl-3">
                              <p className="text-xs ss-subtle">{relativeTime(note.createdAt)}</p>
                              <p className="mt-1 whitespace-pre-line text-sm ss-muted">{note.body}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      <p className="text-xs ss-subtle">
                        {item.progress.sessionsCompleted} of {item.progress.sessionsTotal}{' '}
                        {pluralise(item.progress.sessionsTotal, 'session')} held
                      </p>
                      <div className="flex gap-2">
                        <Link to={`/exchanges/${item.exchangeId}`}>
                          <Button size="sm" variant="secondary">
                            Open workspace
                          </Button>
                        </Link>
                        {item.status === 'COMPLETED' ? (
                          <Link to="/reviews">
                            <Button size="sm">Leave a review</Button>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))
            )}
          </div>

          {/* Reflection prompts */}
          {data.exchanges.some((item) => item.status === 'ACTIVE') ? (
            <Card className="mt-6 border-brand-500/25 bg-gradient-brand-soft">
              <CardHeader
                title="Reflection prompts"
                description="Worth a few minutes before your next session."
                icon={<Lightbulb className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <ul className="space-y-2.5 text-sm ss-muted">
                  {[
                    'What can you now do that you could not do before this exchange started?',
                    'Which session taught you the most, and what made it work?',
                    'Is there anything you would change about how you and your partner are working together?',
                    'What is the next concrete thing you want to be able to do?',
                  ].map((prompt) => (
                    <li key={prompt} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                      {prompt}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs ss-subtle">
                  Jot your answers into the shared notes on the exchange workspace so your partner sees them too.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}
