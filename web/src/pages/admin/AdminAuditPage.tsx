import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Filter, ScrollText, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SelectField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useAdminAuditLogs } from '@/hooks/queries';
import { cn, formatDate, pluralise } from '@/lib/utils';

/** Action prefixes mapped to a readable label and tone. */
function describeAction(action: string): { label: string; tone: 'brand' | 'warning' | 'danger' | 'neutral' | 'info' } {
  if (action.startsWith('admin.user.suspend')) return { label: 'Member suspended', tone: 'danger' };
  if (action.startsWith('admin.user.reinstate')) return { label: 'Member reinstated', tone: 'info' };
  if (action.startsWith('admin.user.promote')) return { label: 'Role changed', tone: 'warning' };
  if (action.startsWith('admin.user.verify')) return { label: 'Email verified manually', tone: 'info' };
  if (action.startsWith('admin.report')) return { label: 'Report handled', tone: 'warning' };
  if (action.startsWith('admin.category')) return { label: 'Taxonomy changed', tone: 'brand' };
  if (action.startsWith('admin.')) return { label: 'Administrative action', tone: 'warning' };
  if (action.startsWith('auth.')) return { label: 'Authentication event', tone: 'neutral' };
  if (action.startsWith('moderation.')) return { label: 'Moderation action', tone: 'warning' };
  return { label: action, tone: 'neutral' };
}

export default function AdminAuditPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => ({ action: debounced || undefined, entityType: entityType || undefined, page, pageSize: 25 }),
    [debounced, entityType, page],
  );

  const { data: auditPage, isLoading, isError, error, refetch } = useAdminAuditLogs(filters);

  const entries = auditPage?.data ?? [];
  const meta = auditPage?.meta;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Audit log"
          description="Every sensitive administrative action, newest first. Entries are append-only and cannot be edited or deleted from the interface."
          icon={<ScrollText className="h-4 w-4" aria-hidden="true" />}
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
              <input
                type="search"
                className="ss-input pl-10"
                placeholder="Filter by action, for example admin.user.suspend…"
                value={search}
                aria-label="Filter audit entries"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <SelectField
              label="Entity type"
              value={entityType}
              onChange={(event) => {
                setEntityType(event.target.value);
                setPage(1);
              }}
              placeholder="Any entity"
              options={[
                { value: 'User', label: 'User' },
                { value: 'Report', label: 'Report' },
                { value: 'SkillCategory', label: 'Skill category' },
                { value: 'Skill', label: 'Skill' },
                { value: 'Exchange', label: 'Exchange' },
              ]}
            />
          </div>
          {debounced || entityType ? (
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => {
                setSearch('');
                setEntityType('');
                setPage(1);
              }}
              leftIcon={<Filter className="h-4 w-4" aria-hidden="true" />}
            >
              Clear filters
            </Button>
          ) : null}
        </CardBody>
      </Card>

      <p className="text-sm ss-muted" aria-live="polite">
        {isLoading ? 'Loading audit entries…' : meta ? `${meta.total} ${pluralise(meta.total, 'entry', 'entries')}` : 'No entries'}
      </p>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Card>
          <CardBody>
            <SkeletonRows count={10} />
          </CardBody>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-7 w-7" aria-hidden="true" />}
          title={debounced || entityType ? 'No entries match those filters' : 'No audit entries yet'}
          description={
            debounced || entityType
              ? 'Try a different action prefix, or clear the filters.'
              : 'Administrative actions will be recorded here as they happen.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-sm">
              <caption className="sr-only">Administrative audit log</caption>
              <thead>
                <tr className="border-b bg-[rgb(var(--ss-bg))] text-left">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Actor
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Summary
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Entity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => {
                  const described = describeAction(entry.action);
                  return (
                    <tr key={entry.id} className="align-top transition-colors hover:bg-[rgb(var(--ss-border)/0.25)]">
                      <td className="whitespace-nowrap px-4 py-3 text-xs ss-muted">
                        <span className="block">{formatDate(entry.createdAt, { dateStyle: 'medium' })}</span>
                        <span className="block ss-subtle">
                          {formatDate(entry.createdAt, { timeStyle: 'short' })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.actor ? (
                          <Link to={`/members/${entry.actor.username}`} className="text-sm font-medium hover:underline">
                            @{entry.actor.username}
                            <span className="ml-1.5 text-xs font-normal capitalize ss-subtle">
                              {entry.actor.role.toLowerCase()}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-xs ss-subtle">System</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={described.tone}>{described.label}</Badge>
                        <p className="mt-1 font-mono text-[11px] ss-subtle">{entry.action}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm ss-muted">{entry.summary}</p>
                      </td>
                      <td className="px-4 py-3 text-xs ss-muted">
                        <span className="block">{entry.entityType}</span>
                        {entry.entityId ? (
                          <span className="block font-mono text-[11px] ss-subtle">
                            {entry.entityId.slice(0, 8)}…
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={!meta.hasPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
              >
                Previous
              </Button>
              <p className="text-sm ss-muted">
                Page {meta.page} of {meta.totalPages}
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={!meta.hasNext}
                onClick={() => setPage((p) => p + 1)}
                rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
              >
                Next
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      <Card>
        <CardBody className={cn('text-sm ss-muted')}>
          <p className="font-medium text-[rgb(var(--ss-text))]">What is recorded, and what is not</p>
          <p className="mt-1.5">
            The log records administrative actions on accounts, reports and the skill taxonomy, together with
            who performed them and when. It deliberately does not record the contents of private messages or
            passwords. This is what makes moderation decisions reviewable without turning the log itself into a
            privacy problem.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
