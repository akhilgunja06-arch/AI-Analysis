import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  Search,
  Shield,
  ShieldOff,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAdminUsers, useAdminUserAction } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { cn, formatDate, pluralise, relativeTime } from '@/lib/utils';
import type { AdminUser, Role } from '@/lib/types';

type PendingAction =
  | { kind: 'suspend'; user: AdminUser }
  | { kind: 'reinstate'; user: AdminUser }
  | { kind: 'promote'; user: AdminUser }
  | { kind: 'verify'; user: AdminUser }
  | null;

export default function AdminUsersPage() {
  const toast = useToast();
  const { isAdmin, user: me } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [newRole, setNewRole] = useState<Role>('MODERATOR');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(
    () => ({ search: debounced || undefined, role: role || undefined, status: status || undefined, page, pageSize: 20 }),
    [debounced, role, status, page],
  );

  const { data: userPage, isLoading, isError, error, refetch } = useAdminUsers(filters);
  const action = useAdminUserAction();

  const users = userPage?.data ?? [];
  const meta = userPage?.meta;

  const run = (input: { id: string; action: string; reason?: string; role?: string }, successMessage: string) =>
    action.mutate(input, {
      onSuccess: () => {
        toast.success(successMessage);
        setPending(null);
        setReason('');
      },
      onError: (err) =>
        toast.error('Action failed', err instanceof ApiError ? err.message : 'Please try again.'),
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Members"
          description="Search, filter and manage accounts. Email addresses are visible only to staff."
          icon={<Shield className="h-4 w-4" aria-hidden="true" />}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative sm:col-span-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
              <input
                type="search"
                className="ss-input pl-10"
                placeholder="Search by username, email or display name…"
                value={searchInput}
                aria-label="Search members"
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 ss-subtle"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <SelectField
              label="Role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
              placeholder="Any role"
              options={[
                { value: 'MEMBER', label: 'Member' },
                { value: 'MODERATOR', label: 'Moderator' },
                { value: 'ADMIN', label: 'Administrator' },
              ]}
            />
            <SelectField
              label="Status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placeholder="Any status"
              options={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'SUSPENDED', label: 'Suspended' },
                { value: 'DEACTIVATED', label: 'Deactivated' },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      <p className="text-sm ss-muted" aria-live="polite">
        {isLoading ? 'Loading members…' : meta ? `${meta.total} ${pluralise(meta.total, 'member')}` : 'No members'}
      </p>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Card>
          <CardBody>
            <SkeletonRows count={8} />
          </CardBody>
        </Card>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Search className="h-7 w-7" aria-hidden="true" />}
          title="No members match those filters"
          description="Try a different search term or clear the role and status filters."
          action={
            <Button
              onClick={() => {
                setSearchInput('');
                setRole('');
                setStatus('');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">Member accounts</caption>
              <thead>
                <tr className="border-b bg-[rgb(var(--ss-bg))] text-left">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Member
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Activity
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Joined
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-[rgb(var(--ss-border)/0.25)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.displayName} src={user.avatarUrl} seed={user.username} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/members/${user.username}`}
                              className="truncate font-medium hover:underline"
                            >
                              {user.displayName}
                            </Link>
                            {user.emailVerified ? (
                              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Email verified" />
                            ) : null}
                          </div>
                          <p className="truncate text-xs ss-subtle">@{user.username}</p>
                          <p className="truncate text-xs ss-subtle">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={user.role === 'ADMIN' ? 'brand' : user.role === 'MODERATOR' ? 'info' : 'neutral'}
                      >
                        {user.role.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          user.status === 'ACTIVE' ? 'success' : user.status === 'SUSPENDED' ? 'danger' : 'neutral'
                        }
                      >
                        {user.status.toLowerCase()}
                      </Badge>
                      {!user.emailVerified ? (
                        <span className="ml-1.5 text-[11px] ss-subtle">unverified</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs ss-muted">
                      <span className="block">{user.counts.exchanges} exchanges</span>
                      <span className="block">{user.counts.posts} posts</span>
                      {user.counts.reportsAgainst > 0 ? (
                        <span className="block text-amber-600 dark:text-amber-400">
                          {user.counts.reportsAgainst} {pluralise(user.counts.reportsAgainst, 'report')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs ss-muted">
                      <span className="block">{formatDate(user.createdAt)}</span>
                      {user.lastLoginAt ? (
                        <span className="block ss-subtle">seen {relativeTime(user.lastLoginAt)}</span>
                      ) : (
                        <span className="block ss-subtle">never signed in</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {!user.emailVerified ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPending({ kind: 'verify', user })}
                            title="Mark this email as verified"
                            leftIcon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Verify
                          </Button>
                        ) : null}

                        {user.status === 'SUSPENDED' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPending({ kind: 'reinstate', user })}
                            leftIcon={<UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Reinstate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            disabled={user.id === me?.id}
                            title={user.id === me?.id ? 'You cannot suspend your own account' : undefined}
                            onClick={() => setPending({ kind: 'suspend', user })}
                            leftIcon={<UserX className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Suspend
                          </Button>
                        )}

                        {isAdmin ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={user.id === me?.id}
                            title={user.id === me?.id ? 'You cannot change your own role' : undefined}
                            onClick={() => {
                              setNewRole(user.role === 'MEMBER' ? 'MODERATOR' : 'MEMBER');
                              setPending({ kind: 'promote', user });
                            }}
                            leftIcon={
                              user.role === 'MEMBER' ? (
                                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                              ) : (
                                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                              )
                            }
                          >
                            Role
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

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
        </>
      )}

      {/* ------------------------------------------------------- dialogs */}
      <Modal
        open={pending?.kind === 'suspend'}
        onClose={() => setPending(null)}
        title={pending ? `Suspend @${pending.user.username}?` : 'Suspend member'}
        description="Suspension signs the member out everywhere and blocks sign-in until reinstated."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={action.isPending}
              disabled={reason.trim().length < 3}
              onClick={() =>
                pending &&
                run(
                  { id: pending.user.id, action: 'suspend', reason: reason.trim() },
                  `@${pending.user.username} suspended`,
                )
              }
            >
              Suspend account
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          showCount
          required
          placeholder="e.g. Repeated harassment in messages, reported by three members."
          hint="Recorded in the audit log and shown to the member."
        />
      </Modal>

      <Modal
        open={pending?.kind === 'reinstate'}
        onClose={() => setPending(null)}
        title={pending ? `Reinstate @${pending.user.username}?` : 'Reinstate member'}
        description="The member will be able to sign in and use the platform again."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              loading={action.isPending}
              onClick={() =>
                pending && run({ id: pending.user.id, action: 'reinstate' }, `@${pending.user.username} reinstated`)
              }
            >
              Reinstate
            </Button>
          </>
        }
      >
        <p className="text-sm ss-muted">
          Their profile, exchanges and history are unaffected. Consider messaging them to explain the decision.
        </p>
      </Modal>

      <Modal
        open={pending?.kind === 'promote'}
        onClose={() => setPending(null)}
        title={pending ? `Change role for @${pending.user.username}` : 'Change role'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              loading={action.isPending}
              onClick={() =>
                pending &&
                run(
                  { id: pending.user.id, action: 'promote', role: newRole },
                  `@${pending.user.username} is now ${newRole.toLowerCase()}`,
                )
              }
            >
              Save role
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="New role"
            value={newRole}
            onChange={(event) => setNewRole(event.target.value as Role)}
            options={[
              { value: 'MEMBER', label: 'Member — normal access' },
              { value: 'MODERATOR', label: 'Moderator — reports and content' },
              { value: 'ADMIN', label: 'Administrator — full access' },
            ]}
          />
          <p
            className={cn(
              'rounded-lg border px-3 py-2 text-xs',
              newRole === 'ADMIN'
                ? 'border-rose-500/35 bg-rose-50/60 text-rose-700 dark:bg-rose-500/5 dark:text-rose-300'
                : 'ss-muted',
            )}
          >
            {newRole === 'ADMIN'
              ? 'Administrators can manage users, the skill taxonomy and see the audit log. Grant this sparingly.'
              : newRole === 'MODERATOR'
                ? 'Moderators can review reports and manage users and community content, but cannot change the taxonomy or view the audit log.'
                : 'Members have normal access: profile, exchanges, messaging and community.'}
          </p>
        </div>
      </Modal>

      <Modal
        open={pending?.kind === 'verify'}
        onClose={() => setPending(null)}
        title={pending ? `Mark @${pending.user.username}'s email as verified?` : 'Verify email'}
        description="Only do this when you have confirmed the address another way, such as replying to them directly."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              loading={action.isPending}
              onClick={() =>
                pending && run({ id: pending.user.id, action: 'verify-email' }, `@${pending.user.username} verified`)
              }
            >
              Mark verified
            </Button>
          </>
        }
      >
        <p className="text-sm ss-muted">
          This unlocks exchange requests, messaging and community posting for them without an email round-trip.
          The action is written to the audit log.
        </p>
      </Modal>
    </div>
  );
}
