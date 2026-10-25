import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  FolderTree,
  MessageSquare,
  RefreshCw,
  Star,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { AnimatedCounter, ProgressBar } from '@/components/animations/Motion';
import { ExchangeDonutChart, SignupTrendChart } from '@/components/widgets/Charts';
import { useAdminOverview } from '@/hooks/queries';
import { formatNumber, pluralise, relativeTime } from '@/lib/utils';
import type { ExchangeStatus } from '@/lib/types';

export default function AdminDashboardPage() {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useAdminOverview();

  if (isError) {
    return <ErrorState error={error} onRetry={() => void refetch()} title="We could not load the overview" />;
  }

  if (isLoading || !data) {
    return <LoadingState label="Loading platform statistics" />;
  }

  const donutData = Object.entries(data.exchanges.byStatus).map(([status, count]) => ({
    status: status as ExchangeStatus,
    count,
  }));

  const totalUsers = data.users.total || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm ss-muted">
          Figures are counted live from the database. Last refreshed {relativeTime(new Date(dataUpdatedAt).toISOString())}.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          loading={isFetching}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          Refresh
        </Button>
      </div>

      {/* Headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total members"
          value={<AnimatedCounter value={data.users.total} />}
          hint={`${formatNumber(data.users.newLast30Days)} joined in 30 days`}
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          tone="brand"
        />
        <StatCard
          label="Active accounts"
          value={<AnimatedCounter value={data.users.active} />}
          hint={`${Math.round((data.users.active / totalUsers) * 100)}% of all members`}
          icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
          tone="emerald"
        />
        <StatCard
          label="Unverified"
          value={<AnimatedCounter value={data.users.pendingVerification} />}
          hint="Have not confirmed their email"
          icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
        />
        <StatCard
          label="Suspended"
          value={<AnimatedCounter value={data.users.suspended} />}
          hint="Accounts currently restricted"
          icon={<UserX className="h-5 w-5" aria-hidden="true" />}
          tone="violet"
        />
      </div>

      {/* Moderation alert */}
      {data.moderation.openReports > 0 ? (
        <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/5">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">
                  {data.moderation.openReports} open {pluralise(data.moderation.openReports, 'report')}
                </p>
                <p className="mt-0.5 text-sm ss-muted">
                  Reports are queued oldest-first. Members expect a decision within a few days.
                </p>
              </div>
            </div>
            <Link to="/admin/reports">
              <Button size="sm">Open moderation queue</Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Signups */}
        <Card>
          <CardHeader
            title="New accounts"
            description="Registrations over the last 30 days."
            icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <SignupTrendChart data={data.signupSeries} />
          </CardBody>
        </Card>

        {/* Exchange status */}
        <Card>
          <CardHeader
            title="Exchanges by status"
            description={`${formatNumber(data.exchanges.total)} total across all states.`}
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <ExchangeDonutChart data={donutData} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity */}
        <Card>
          <CardHeader
            title="Platform activity"
            description="Everything recorded to date."
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <dl className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm ss-muted">
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  Sessions scheduled
                </dt>
                <dd className="font-display text-lg font-bold tabular-nums">
                  {formatNumber(data.activity.sessionsScheduled)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm ss-muted">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Messages sent
                </dt>
                <dd className="font-display text-lg font-bold tabular-nums">{formatNumber(data.activity.messages)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm ss-muted">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Community posts
                </dt>
                <dd className="font-display text-lg font-bold tabular-nums">
                  {formatNumber(data.activity.communityPosts)}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        {/* Reviews */}
        <Card>
          <CardHeader
            title="Reviews"
            description="Aggregated from stored reviews only."
            icon={<Star className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {data.reviews.total === 0 ? (
              <EmptyState
                compact
                title="No reviews yet"
                description="Average ratings appear once members complete exchanges and leave feedback."
              />
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="font-display text-4xl font-extrabold tabular-nums">
                    {data.reviews.averageRating?.toFixed(2) ?? '—'}
                  </p>
                  <p className="mt-1 text-xs ss-subtle">average rating out of 5</p>
                </div>
                <ProgressBar
                  value={((data.reviews.averageRating ?? 0) / 5) * 100}
                  label={`${formatNumber(data.reviews.total)} ${pluralise(data.reviews.total, 'review')}`}
                  tone="amber"
                  showValue
                />
              </div>
            )}
          </CardBody>
        </Card>

        {/* Taxonomy */}
        <Card>
          <CardHeader
            title="Skill taxonomy"
            description="The catalogue members pick from."
            icon={<FolderTree className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <dl className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm ss-muted">Categories</dt>
                <dd className="font-display text-lg font-bold tabular-nums">{data.taxonomy.categories}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm ss-muted">Skills</dt>
                <dd className="font-display text-lg font-bold tabular-nums">{data.taxonomy.skills}</dd>
              </div>
            </dl>
            <Link to="/admin/categories" className="mt-5 block">
              <Button variant="secondary" size="sm" fullWidth>
                Manage taxonomy
              </Button>
            </Link>
          </CardBody>
        </Card>
      </div>

      <p className="text-xs ss-subtle">
        Statistics generated {relativeTime(data.generatedAt)}. Sensitive identifiers are excluded from all
        administrative responses.
      </p>
    </div>
  );
}
