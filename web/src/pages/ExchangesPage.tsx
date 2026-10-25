import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Plus, Sparkles, Users } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/Feedback';
import { Reveal } from '@/components/animations/Motion';
import { ExchangeCard } from '@/components/widgets/ExchangeWidgets';
import { useExchanges } from '@/hooks/queries';
import { cn, pluralise } from '@/lib/utils';
import type { ExchangeStatus } from '@/lib/types';

const TABS: { value: string; label: string; status?: ExchangeStatus }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', status: 'ACTIVE' },
  { value: 'accepted', label: 'Ready to start', status: 'ACCEPTED' },
  { value: 'paused', label: 'Paused', status: 'PAUSED' },
  { value: 'completed', label: 'Completed', status: 'COMPLETED' },
];

export default function ExchangesPage() {
  const [tab, setTab] = useState('all');
  const selected = TABS.find((t) => t.value === tab);
  const { data: exchanges, isLoading, isError, error, refetch } = useExchanges(selected?.status);

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Exchanges</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Every exchange you are part of. Open one to see its sessions, milestones, shared notes and history.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/exchanges/requests">
            <Button variant="secondary" leftIcon={<Inbox className="h-4 w-4" aria-hidden="true" />}>
              Requests
            </Button>
          </Link>
          <Link to="/matches">
            <Button leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}>Find partners</Button>
          </Link>
        </div>
      </div>

      {/* Status tabs */}
      <div className="mt-6 flex flex-wrap gap-1 rounded-xl border p-1" role="tablist" aria-label="Exchange status">
        {TABS.map((item) => (
          <button
            key={item.value}
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === item.value
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'ss-muted hover:bg-[rgb(var(--ss-border)/0.5)]',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonGrid count={4} columns={2} />
        ) : !exchanges || exchanges.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" aria-hidden="true" />}
            title={tab === 'all' ? 'No exchanges yet' : `Nothing in ${selected?.label.toLowerCase()}`}
            description={
              tab === 'all'
                ? 'An exchange starts when you accept a request, or when someone accepts yours.'
                : 'Try another tab, or look at your pending requests.'
            }
            action={
              <Link to="/exchanges/requests">
                <Button leftIcon={<Inbox className="h-4 w-4" aria-hidden="true" />}>View requests</Button>
              </Link>
            }
            secondaryAction={
              <Link to="/matches">
                <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                  Propose an exchange
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm ss-muted">
              {exchanges.length} {pluralise(exchanges.length, 'exchange')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {exchanges.map((exchange, index) => (
                <Reveal key={exchange.id} delay={Math.min(index * 0.04, 0.25)}>
                  <Link to={`/exchanges/${exchange.id}`} className="block h-full">
                    <ExchangeCard exchange={exchange} />
                  </Link>
                </Reveal>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Explainer for how states work */}
      <Card className="mt-8">
        <CardHeader
          title="How the exchange lifecycle works"
          description="Statuses change only through permitted transitions, enforced on the server."
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
        />
        <CardBody>
          <ol className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Pending', body: 'A request has been sent and is awaiting a reply.' },
              { label: 'Accepted', body: 'Both members agreed the terms; the workspace exists.' },
              { label: 'Active', body: 'Sessions are being held and progress recorded.' },
              { label: 'Completed', body: 'Both members finished; reviews can be left.' },
            ].map((stage, index) => (
              <li key={stage.label} className="rounded-xl border p-4">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white">
                  {index + 1}
                </span>
                <p className="mt-2 font-semibold">{stage.label}</p>
                <p className="mt-1 text-xs ss-muted">{stage.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs ss-subtle">
            An exchange can also be paused, resumed, cancelled or declined. Completed exchanges are kept as
            part of your learning history.
          </p>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
