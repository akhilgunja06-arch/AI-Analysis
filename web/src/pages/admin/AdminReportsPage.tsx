import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  ShieldAlert,
  Trash2,
  UserX,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAdminReports, useResolveReport } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { pluralise, relativeTime } from '@/lib/utils';
import type { AdminReport } from '@/lib/types';

type Resolution = {
  report: AdminReport;
  status: 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  action: string;
  note: string;
};

const STATUS_TONE: Record<string, 'warning' | 'info' | 'success' | 'neutral'> = {
  OPEN: 'warning',
  UNDER_REVIEW: 'info',
  RESOLVED: 'success',
  DISMISSED: 'neutral',
};

const TARGET_LABELS: Record<string, string> = {
  USER: 'Member',
  MESSAGE: 'Message',
  REVIEW: 'Review',
  COMMUNITY_POST: 'Community post',
  COMMUNITY_COMMENT: 'Community reply',
  CONVERSATION: 'Conversation',
};

export default function AdminReportsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('OPEN');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);
  const [resolution, setResolution] = useState<Resolution | null>(null);

  const filters = useMemo(
    () => ({ status: status || undefined, targetType: targetType || undefined, page, pageSize: 15 }),
    [status, targetType, page],
  );

  const { data: reportPage, isLoading, isError, error, refetch } = useAdminReports(filters);
  const resolve = useResolveReport();

  const reports = reportPage?.data ?? [];
  const meta = reportPage?.meta;

  const openResolution = (report: AdminReport, preset: Partial<Resolution>) => {
    setResolution({ report, status: 'RESOLVED', action: 'NONE', note: '', ...preset });
  };

  const submit = () => {
    if (!resolution) return;
    resolve.mutate(
      {
        id: resolution.report.id,
        status: resolution.status,
        action: resolution.action,
        note: resolution.note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Report updated', 'The decision is recorded in the audit log.');
          setResolution(null);
        },
        onError: (err) =>
          toast.error('Could not update the report', err instanceof ApiError ? err.message : undefined),
      },
    );
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Moderation queue"
          description="Reports from members, oldest first. Every decision is written to the audit log."
          icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placeholder="All statuses"
              options={[
                { value: 'OPEN', label: 'Open' },
                { value: 'UNDER_REVIEW', label: 'Under review' },
                { value: 'RESOLVED', label: 'Resolved' },
                { value: 'DISMISSED', label: 'Dismissed' },
              ]}
            />
            <SelectField
              label="Content type"
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value);
                setPage(1);
              }}
              placeholder="All types"
              options={Object.entries(TARGET_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <div className="flex items-end">
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setStatus('');
                  setTargetType('');
                  setPage(1);
                }}
                leftIcon={<Filter className="h-4 w-4" aria-hidden="true" />}
              >
                Show everything
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <p className="text-sm ss-muted" aria-live="polite">
        {isLoading ? 'Loading reports…' : meta ? `${meta.total} ${pluralise(meta.total, 'report')}` : 'No reports'}
      </p>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Card>
          <CardBody>
            <SkeletonRows count={6} />
          </CardBody>
        </Card>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-7 w-7" aria-hidden="true" />}
          title={status === 'OPEN' ? 'Nothing waiting in the queue' : 'No reports match those filters'}
          description={
            status === 'OPEN'
              ? 'Every open report has been dealt with. New reports appear here automatically.'
              : 'Try widening the filters to see reports in other states.'
          }
          action={
            status !== '' ? (
              <Button
                onClick={() => {
                  setStatus('');
                  setTargetType('');
                }}
              >
                Show all reports
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li key={report.id}>
              <Card>
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={STATUS_TONE[report.status] ?? 'neutral'}>{report.status.toLowerCase().replace('_', ' ')}</Badge>
                        <Badge variant="neutral">{TARGET_LABELS[report.targetType] ?? report.targetType}</Badge>
                        <span className="text-xs ss-subtle">{report.reason.toLowerCase().replace(/_/g, ' ')}</span>
                      </div>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="ss-muted">Reported by</span>
                        <Link to={`/members/${report.reporter.username}`} className="flex items-center gap-1.5 font-medium hover:underline">
                          <Avatar name={report.reporter.displayName} seed={report.reporter.username} size="xs" />
                          {report.reporter.displayName}
                        </Link>
                        <span className="ss-subtle">{relativeTime(report.createdAt)}</span>
                      </p>
                      {report.targetUser ? (
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                          <span className="ss-muted">About</span>
                          <Link
                            to={`/members/${report.targetUser.username}`}
                            className="flex items-center gap-1.5 font-medium hover:underline"
                          >
                            <Avatar
                              name={report.targetUser.displayName}
                              seed={report.targetUser.username}
                              size="xs"
                            />
                            {report.targetUser.displayName}
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    {report.handledAt ? (
                      <p className="text-xs ss-subtle">Handled {relativeTime(report.handledAt)}</p>
                    ) : null}
                  </div>

                  {report.excerpt ? (
                    <blockquote className="rounded-xl border-l-2 border-brand-500/50 bg-[rgb(var(--ss-bg))] px-4 py-3 text-sm ss-muted">
                      {report.excerpt}
                    </blockquote>
                  ) : null}

                  {report.details ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                        What the reporter said
                      </p>
                      <p className="mt-1 text-sm ss-muted">{report.details}</p>
                    </div>
                  ) : null}

                  {report.resolutionNote ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 px-4 py-3 dark:bg-emerald-500/5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                        Decision ({report.actionTaken.toLowerCase().replace(/_/g, ' ')})
                      </p>
                      <p className="mt-1 text-sm ss-muted">{report.resolutionNote}</p>
                    </div>
                  ) : null}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    {report.status === 'OPEN' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openResolution(report, { status: 'UNDER_REVIEW', action: 'NONE' })}
                        leftIcon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                      >
                        Mark under review
                      </Button>
                    ) : null}

                    {report.targetId && report.status !== 'RESOLVED' && report.status !== 'DISMISSED' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openResolution(report, { action: 'CONTENT_HIDDEN' })}
                        >
                          Hide content
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => openResolution(report, { action: 'CONTENT_REMOVED' })}
                          leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                        >
                          Remove content
                        </Button>
                      </>
                    ) : null}

                    {report.targetUser ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => openResolution(report, { action: 'USER_SUSPENDED' })}
                        leftIcon={<UserX className="h-3.5 w-3.5" aria-hidden="true" />}
                      >
                        Suspend member
                      </Button>
                    ) : null}

                    {report.status !== 'RESOLVED' && report.status !== 'DISMISSED' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openResolution(report, { action: 'WARNING_ISSUED' })}
                        >
                          Issue warning
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => openResolution(report, { status: 'DISMISSED', action: 'REPORT_DISMISSED' })}
                          leftIcon={<XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                        >
                          Dismiss
                        </Button>
                      </>
                    ) : null}

                    {report.status === 'RESOLVED' || report.status === 'DISMISSED' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openResolution(report, { status: 'UNDER_REVIEW', action: 'NONE' })}
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
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
        </nav>
      ) : null}

      {/* Resolution dialog */}
      <Modal
        open={Boolean(resolution)}
        onClose={() => setResolution(null)}
        title="Record a moderation decision"
        description="The decision, the action and your note are written to the audit log and shown to the reporter."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolution(null)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              loading={resolve.isPending}
              variant={
                resolution?.action === 'CONTENT_REMOVED' || resolution?.action === 'USER_SUSPENDED'
                  ? 'danger'
                  : 'primary'
              }
              disabled={resolution?.note.trim().length === 0}
            >
              Save decision
            </Button>
          </>
        }
      >
        {resolution ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-[rgb(var(--ss-bg))] p-4 text-sm">
              <p className="font-medium">{resolution.report.reason.toLowerCase().replace(/_/g, ' ')}</p>
              <p className="mt-1 ss-muted">
                {TARGET_LABELS[resolution.report.targetType] ?? resolution.report.targetType} reported by{' '}
                {resolution.report.reporter.displayName}
                {resolution.report.targetUser ? ` about ${resolution.report.targetUser.displayName}` : ''}
              </p>
            </div>

            <SelectField
              label="New status"
              value={resolution.status}
              onChange={(event) =>
                setResolution({ ...resolution, status: event.target.value as Resolution['status'] })
              }
              options={[
                { value: 'UNDER_REVIEW', label: 'Under review — keep it open' },
                { value: 'RESOLVED', label: 'Resolved — action taken' },
                { value: 'DISMISSED', label: 'Dismissed — no action needed' },
              ]}
            />

            <SelectField
              label="Action taken"
              value={resolution.action}
              onChange={(event) => setResolution({ ...resolution, action: event.target.value })}
              options={[
                { value: 'NONE', label: 'No action' },
                ...(resolution.report.targetId
                  ? [
                      { value: 'CONTENT_HIDDEN', label: 'Hide the content' },
                      { value: 'CONTENT_REMOVED', label: 'Remove the content' },
                    ]
                  : []),
                { value: 'WARNING_ISSUED', label: 'Issue a warning' },
                ...(resolution.report.targetUser
                  ? [
                      { value: 'USER_SUSPENDED', label: 'Suspend the member' },
                      { value: 'USER_REINSTATED', label: 'Reinstate the member' },
                    ]
                  : []),
                { value: 'REPORT_DISMISSED', label: 'Dismiss the report' },
              ]}
            />

            {resolution.action === 'USER_SUSPENDED' ? (
              <p className="flex items-start gap-2 rounded-lg border border-rose-500/35 bg-rose-50/60 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/5 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Suspending signs the member out everywhere immediately. Only do this when you are confident.
              </p>
            ) : null}

            <TextAreaField
              label="Note explaining the decision"
              value={resolution.note}
              onChange={(event) => setResolution({ ...resolution, note: event.target.value })}
              maxLength={1000}
              showCount
              required
              className="min-h-[130px]"
              placeholder="e.g. The message breached the conduct rules on harassment. Content hidden and a warning issued."
              hint="Shown to the reporter and stored in the audit log. Be factual."
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
