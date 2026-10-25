import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Clock,
  Compass,
  GraduationCap,
  Inbox,
  MessageSquare,
  Search,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, ExchangeStatusBadge, SkillChip } from '@/components/ui/Badge';
import {
  EmptyState,
  ErrorState,
  SkeletonCard,
  SkeletonRows,
} from '@/components/ui/Feedback';
import { AnimatedCounter, ProgressBar, ProgressRing, Reveal } from '@/components/animations/Motion';
import { ActivityAreaChart, ExchangeDonutChart } from '@/components/widgets/Charts';
import { useDashboard } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { formatNumber, formatSessionTime, pluralise, relativeTime } from '@/lib/utils';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { data, isLoading, isError, error, refetch } = useDashboard();

  const firstName = (profile?.displayName ?? data?.greeting.displayName ?? 'there').split(' ')[0];

  if (isError) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={() => void refetch()} title="We could not load your dashboard" />
      </PageContainer>
    );
  }

  const completion = data?.completion;

  return (
    <PageContainer>
      {/* ------------------------------------------------------- greeting */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">
            {isLoading ? 'Welcome back' : `Welcome back, ${firstName}`}
          </h1>
          <p className="mt-1.5 ss-muted">
            {data && data.requests.incoming.length > 0
              ? `You have ${data.requests.incoming.length} ${pluralise(data.requests.incoming.length, 'request')} waiting for a reply.`
              : 'Here is where your exchanges stand today.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/my-skills">
            <Button variant="secondary" leftIcon={<Target className="h-4 w-4" aria-hidden="true" />}>
              Add a skill
            </Button>
          </Link>
          <Link to="/matches">
            <Button leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}>Find partners</Button>
          </Link>
        </div>
      </div>

      {/* --------------------------------------------------- quick stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active exchanges"
          value={data ? <AnimatedCounter value={data.activeExchanges.length} /> : 0}
          hint="Currently in progress"
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          tone="emerald"
          loading={isLoading}
        />
        <StatCard
          label="Completed"
          value={data ? <AnimatedCounter value={data.reputation.completedExchanges} /> : 0}
          hint="Finished exchanges"
          icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
          tone="brand"
          loading={isLoading}
        />
        <StatCard
          label="Learning time"
          value={data ? `${formatNumber(data.activity.learningMinutesThisWeek)}m` : '0m'}
          hint="Completed sessions this week"
          icon={<Clock className="h-5 w-5" aria-hidden="true" />}
          tone="violet"
          loading={isLoading}
        />
        <StatCard
          label="Your rating"
          value={data?.reputation.averageRating !== null && data ? data.reputation.averageRating.toFixed(1) : '—'}
          hint={
            data
              ? `${data.reputation.reviewsCount} ${pluralise(data.reputation.reviewsCount, 'review')}`
              : undefined
          }
          icon={<Star className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
          loading={isLoading}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ------------------------------------------------- left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Completion */}
          <Card>
            <CardHeader
              title="Profile completion"
              description="A complete profile gets noticeably better matches."
              icon={<Target className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody className="flex flex-wrap items-center gap-6">
              {isLoading || !completion ? (
                <div className="ss-skeleton h-24 w-24 rounded-full" />
              ) : (
                <ProgressRing
                  value={completion.percent}
                  size={104}
                  label="Profile completion"
                  tone={completion.percent === 100 ? 'emerald' : 'brand'}
                />
              )}
              <div className="min-w-0 flex-1">
                {completion && completion.missing.length > 0 ? (
                  <>
                    <p className="text-sm font-medium">Still to do</p>
                    <ul className="mt-2 space-y-1.5">
                      {completion.missing.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm ss-muted">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link to="/onboarding" className="mt-4 inline-block">
                      <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Finish your profile
                      </Button>
                    </Link>
                  </>
                ) : (
                  <p className="flex items-start gap-2 text-sm ss-muted">
                    <Star className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                    Your profile is complete. Keep your availability up to date so partners can find time with
                    you.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Requests awaiting reply */}
          <Card>
            <CardHeader
              title="Pending exchange requests"
              description="People who have asked to trade skills with you."
              icon={<Inbox className="h-4 w-4" aria-hidden="true" />}
              action={
                data && data.requests.incoming.length > 0 ? (
                  <Link to="/exchanges/requests" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">
                    View all
                  </Link>
                ) : null
              }
            />
            <CardBody className="pt-2">
              {isLoading ? (
                <SkeletonRows count={2} />
              ) : !data || data.requests.incoming.length === 0 ? (
                <EmptyState
                  compact
                  title="No requests waiting"
                  description="When someone proposes an exchange, it will appear here for you to accept, decline or counter."
                  action={
                    <Link to="/matches">
                      <Button size="sm" leftIcon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Find someone to learn from
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {data.requests.incoming.slice(0, 4).map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
                      <Avatar
                        name={request.from.displayName}
                        src={request.from.avatarUrl}
                        seed={request.from.username}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{request.from.displayName}</p>
                        <p className="truncate text-xs ss-muted">
                          {request.offeredSkill && request.requestedSkill
                            ? `${request.offeredSkill} in exchange for ${request.requestedSkill}`
                            : request.message ?? 'Wants to exchange skills'}
                        </p>
                        <p className="mt-0.5 text-xs ss-subtle">{relativeTime(request.createdAt)}</p>
                      </div>
                      <ExchangeStatusBadge status={request.status} />
                      <Link to="/exchanges/requests">
                        <Button size="sm" variant="secondary">
                          Review
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Active exchanges */}
          <Card>
            <CardHeader
              title="Active exchanges"
              description="Progress is counted from sessions and milestones you have recorded."
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              action={
                <Link to="/exchanges" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  All exchanges
                </Link>
              }
            />
            <CardBody>
              {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              ) : !data || data.activeExchanges.length === 0 ? (
                <EmptyState
                  compact
                  title="No active exchanges"
                  description="Once a request is accepted, the exchange appears here with its progress."
                  action={
                    <Link to="/exchanges/requests">
                      <Button size="sm" variant="secondary">
                        Go to requests
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {data.activeExchanges.slice(0, 4).map((exchange) => (
                    <Card key={exchange.id} interactive className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">
                            {exchange.partner?.displayName ?? exchange.title}
                          </h3>
                          <p className="text-xs ss-subtle">Updated {relativeTime(exchange.updatedAt)}</p>
                        </div>
                        <ExchangeStatusBadge status={exchange.status} />
                      </div>
                      {exchange.goals ? (
                        <p className="ss-clamp-2 mt-2 text-xs ss-muted">{exchange.goals}</p>
                      ) : null}
                      <div className="mt-3">
                        <ProgressBar
                          value={
                            exchange.progress.sessionsTotal > 0
                              ? (exchange.progress.milestonesTotal > 0 ? 50 : 100)
                              : 0
                          }
                          label="Workspace progress"
                        />
                      </div>
                      <Link
                        to={`/exchanges/${exchange.id}`}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                      >
                        Open workspace
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </Card>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Activity chart */}
          <Card>
            <CardHeader
              title="Your weekly activity"
              description="Sessions and messages recorded over the last two weeks."
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {isLoading ? (
                <div className="ss-skeleton h-[220px] w-full rounded-xl" />
              ) : (
                <ActivityAreaChart
                  data={data?.activity.series ?? []}
                  unit="sessions"
                  emptyMessage="No sessions recorded yet. Once you complete a session it will show up here."
                />
              )}
            </CardBody>
          </Card>

          {/* Skills */}
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader
                title="Skills you teach"
                description={data ? `${data.skills.teaches.length} listed` : undefined}
                icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                {isLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <span key={i} className="ss-skeleton h-7 w-20 rounded-full" />
                    ))}
                  </div>
                ) : data && data.skills.teaches.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.skills.teaches.map((skill) => (
                      <SkillChip key={skill.id} name={skill.name} level={skill.level} tone="brand" />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="Nothing yet"
                    description="Add a skill you can teach so partners can find you."
                    action={
                      <Link to="/my-skills">
                        <Button size="sm" leftIcon={<Target className="h-3.5 w-3.5" aria-hidden="true" />}>
                          Add a skill
                        </Button>
                      </Link>
                    }
                  />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Skills you are learning"
                description={data ? `${data.skills.wants.length} listed` : undefined}
                icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                {isLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <span key={i} className="ss-skeleton h-7 w-20 rounded-full" />
                    ))}
                  </div>
                ) : data && data.skills.wants.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.skills.wants.map((skill) => (
                      <SkillChip key={skill.id} name={skill.name} level={skill.level} tone="learn" />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="No learning goals"
                    description="Add what you want to learn — this is what drives your matches."
                    action={
                      <Link to="/my-skills">
                        <Button size="sm" leftIcon={<Target className="h-3.5 w-3.5" aria-hidden="true" />}>
                          Add a goal
                        </Button>
                      </Link>
                    }
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        {/* ------------------------------------------------ right column */}
        <div className="space-y-6">
          {/* Upcoming sessions */}
          <Card>
            <CardHeader
              title="Upcoming sessions"
              description="Times are shown in your timezone, with the host timezone when it differs."
              icon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
              action={
                <Link to="/calendar" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  Calendar
                </Link>
              }
            />
            <CardBody className="pt-2">
              {isLoading ? (
                <SkeletonRows count={2} />
              ) : !data || data.upcomingSessions.length === 0 ? (
                <EmptyState
                  compact
                  title="Nothing scheduled"
                  description="Book a session from an active exchange to see it here."
                  action={
                    <Link to="/calendar">
                      <Button size="sm" variant="secondary" leftIcon={<CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Open calendar
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="space-y-3">
                  {data.upcomingSessions.slice(0, 3).map((session) => (
                    <li key={session.id} className="rounded-xl border p-3.5">
                      <p className="text-sm font-semibold">{session.title}</p>
                      <p className="mt-1 text-xs ss-muted">
                        {formatSessionTime(session.startsAt, session.timezone)}
                      </p>
                      <p className="mt-1 text-xs ss-subtle">Hosted by {session.host}</p>
                      {session.meetingUrl ? (
                        <a
                          href={session.meetingUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                        >
                          Join link
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader
              title="Recommended partners"
              description="Scored on reciprocal skills, language and timezone."
              icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              action={
                <Link to="/matches" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  See all
                </Link>
              }
            />
            <CardBody className="pt-2">
              {isLoading ? (
                <SkeletonRows count={3} />
              ) : !data || data.recommendations.length === 0 ? (
                <EmptyState
                  compact
                  title="No matches yet"
                  description="Add at least one skill to teach and one to learn, and matches will appear."
                  action={
                    <Link to="/my-skills">
                      <Button size="sm" leftIcon={<Target className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Add skills
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {data.recommendations.slice(0, 4).map((match) => (
                    <li key={match.userId} className="flex items-center gap-3 py-3">
                      <Avatar
                        name={match.displayName}
                        src={match.avatarUrl}
                        seed={match.username}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{match.displayName}</p>
                        <p className="ss-clamp-2 text-xs ss-muted">
                          {match.reasons[0] ?? match.headline ?? 'Complementary skills'}
                        </p>
                      </div>
                      <Badge variant="brand" className="shrink-0">
                        {match.score}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Exchange breakdown */}
          <Card>
            <CardHeader
              title="Exchange status"
              description="Every exchange you have been part of."
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {isLoading ? (
                <div className="ss-skeleton h-[220px] w-full rounded-xl" />
              ) : (
                <ExchangeDonutChart data={data?.exchangeBreakdown ?? []} />
              )}
            </CardBody>
          </Card>

          {/* Messages */}
          <Card>
            <CardHeader
              title="Recent messages"
              description={data && data.messages.unread > 0 ? `${data.messages.unread} unread` : 'All caught up'}
              icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
              action={
                <Link to="/messages" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  Open inbox
                </Link>
              }
            />
            <CardBody className="pt-2">
              {isLoading ? (
                <SkeletonRows count={2} />
              ) : !data || data.messages.recent.length === 0 ? (
                <EmptyState
                  compact
                  title="No conversations"
                  description="Message a member from their profile or from an exchange."
                  action={
                    <Link to="/members">
                      <Button size="sm" variant="secondary" leftIcon={<Compass className="h-3.5 w-3.5" aria-hidden="true" />}>
                        Find members
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y">
                  {data.messages.recent.slice(0, 3).map((message) => (
                    <li key={message.conversationId} className="flex items-center gap-3 py-3">
                      <Avatar
                        name={message.with?.displayName ?? 'Member'}
                        src={message.with?.avatarUrl}
                        seed={message.with?.username}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {message.fromMe ? 'You' : (message.with?.displayName ?? 'Member')}
                        </p>
                        <p className="truncate text-xs ss-muted">{message.preview}</p>
                      </div>
                      <span className="shrink-0 text-xs ss-subtle">{relativeTime(message.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* -------------------------------------------------- first-run help */}
      {!isLoading && data && data.reputation.completedExchanges === 0 && data.activeExchanges.length === 0 ? (
        <Reveal className="mt-6">
          <Card className="border-brand-500/30 bg-gradient-brand-soft p-6">
            <div className="flex flex-wrap items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-semibold">Your first exchange</h2>
                <p className="mt-1.5 text-sm ss-muted">
                  The quickest path: add one skill you can teach, one you want to learn, then look at your
                  matches. Send a request with a short note about what you would like to cover — specific
                  proposals get accepted far more often.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/my-skills">
                    <Button size="sm" leftIcon={<Target className="h-3.5 w-3.5" aria-hidden="true" />}>
                      Add your skills
                    </Button>
                  </Link>
                  <Link to="/matches">
                    <Button size="sm" variant="secondary" leftIcon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}>
                      See matches
                    </Button>
                  </Link>
                  <Link to="/explore">
                    <Button size="sm" variant="ghost" leftIcon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}>
                      Browse skills
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </Reveal>
      ) : null}
    </PageContainer>
  );
}
