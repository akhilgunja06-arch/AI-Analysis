import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, MessageSquare, Search, UserPlus, Users } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMemberSearch, useStartConversation } from '@/hooks/queries';
import { useNavigate } from 'react-router-dom';
import { relativeTime } from '@/lib/utils';

/**
 * Full search results for a username query.
 *
 * The navbar dropdown is the fast path; this page exists for the "see all"
 * case and for a shareable URL. It reuses the same endpoint, so a member who is
 * hidden or blocked is hidden here too.
 */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(input, 300);
  const query = params.get('q') ?? '';

  // Keep the URL in step with the box, so a reload or a shared link works.
  useEffect(() => {
    const next = debounced.trim();
    if (next === query) return;
    if (next) setParams({ q: next }, { replace: true });
    else setParams({}, { replace: true });
  }, [debounced, query, setParams]);

  const { data: results = [], isFetching, isError, error } = useMemberSearch(query, true);
  const startConversation = useStartConversation();

  const openChat = async (username: string, conversationId: string | null) => {
    if (conversationId) {
      navigate(`/messages/${conversationId}`);
      return;
    }
    const result = await startConversation.mutateAsync({ username });
    navigate(`/messages/${result.data.conversationId}`);
  };

  const tooShort = query.trim().length > 0 && query.trim().length < 2;

  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Search' }]} />

      <header className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Find people</h1>
        <p className="mt-1 text-sm ss-subtle">
          Search by username or display name. Only members who share a public profile appear.
        </p>
      </header>

      <div className="mt-5 max-w-xl">
        <label htmlFor="member-search" className="sr-only">
          Search members
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            id="member-search"
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="e.g. priya"
            autoFocus
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          {isFetching ? (
            <Loader2
              aria-hidden
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
            />
          ) : null}
        </div>
      </div>

      <section aria-live="polite" className="mt-6">
        {tooShort && (
          <p className="text-sm ss-subtle">Type at least two characters to search.</p>
        )}

        {isError && (
          <Card className="p-6">
            <p className="text-sm text-rose-600 dark:text-rose-400">
              {error instanceof Error ? error.message : 'Search failed. Please try again.'}
            </p>
          </Card>
        )}

        {!isError && !tooShort && query.trim().length >= 2 && !isFetching && results.length === 0 && (
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden />}
            title={`No member matches “${query}”`}
            description="Check the spelling, or browse the directory to discover members by skill."
            action={
              <Link to="/explore" className="ss-btn ss-btn-secondary">
                Browse the directory
              </Link>
            }
          />
        )}

        {results.length > 0 && (
          <>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide ss-subtle">
              {results.length} {results.length === 1 ? 'member' : 'members'} found
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {results.map((member) => (
                <li key={member.id}>
                  <Card className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <span className="relative shrink-0">
                        <Avatar
                          name={member.displayName || member.username}
                          src={member.avatarUrl}
                          size="md"
                        />
                        {member.online && (
                          <span
                            aria-label="Online now"
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900"
                          />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/members/${member.username}`}
                          className="block truncate font-medium hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          {member.displayName}
                        </Link>
                        <p className="truncate text-xs ss-subtle">@{member.username}</p>
                        <p className="mt-1 text-xs ss-subtle">
                          {member.online
                            ? 'Online now'
                            : member.lastSeenAt
                              ? `Last seen ${relativeTime(member.lastSeenAt)}`
                              : 'Offline'}
                        </p>
                      </div>
                    </div>

                    {member.headline && (
                      <p className="line-clamp-2 text-sm ss-subtle">{member.headline}</p>
                    )}

                    {member.teaches.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {member.teaches.slice(0, 3).map((skill) => (
                          <Badge key={skill.slug} variant="brand">
                            {skill.name}
                          </Badge>
                        ))}
                        {member.teaches.length > 3 && (
                          <Badge variant="neutral">+{member.teaches.length - 3}</Badge>
                        )}
                      </div>
                    )}

                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <Link
                        to={`/members/${member.username}`}
                        className="ss-btn ss-btn-secondary ss-btn-sm flex-1"
                      >
                        View profile
                      </Link>
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => void openChat(member.username, member.conversationId)}
                        disabled={startConversation.isPending}
                      >
                        {member.conversationId ? (
                          <>
                            <MessageSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                            Open chat
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                            Message
                          </>
                        )}
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </PageContainer>
  );
}
