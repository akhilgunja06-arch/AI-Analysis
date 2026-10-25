import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Filter,
  Languages,
  MapPin,
  RotateCcw,
  Search,
  Star,
  Users,
  X,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { SkillChip } from '@/components/ui/Badge';
import { SelectField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/Feedback';
import { Reveal, StaggerItem, StaggerList } from '@/components/animations/Motion';
import { useMembers, useSkillSearch } from '@/hooks/queries';
import { COMMON_TIMEZONES, formatNumber, pluralise, weekdayName } from '@/lib/utils';
import type { Skill } from '@/lib/types';

/** Public member directory. Never renders private data such as email addresses. */
export default function MembersPage() {
  const [params, setParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  const [teachesSkillId, setTeachesSkillId] = useState('');
  const [wantsSkillId, setWantsSkillId] = useState('');
  const [language, setLanguage] = useState(params.get('language') ?? '');
  const [timezone, setTimezone] = useState(params.get('timezone') ?? '');
  const [format, setFormat] = useState('');
  const [sort, setSort] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data: skills } = useSkillSearch('', undefined, true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      teachesSkillId: teachesSkillId || undefined,
      wantsSkillId: wantsSkillId || undefined,
      language: language || undefined,
      timezone: timezone || undefined,
      format: format || undefined,
      sort,
      page,
      pageSize: 12,
    }),
    [debouncedSearch, teachesSkillId, wantsSkillId, language, timezone, format, sort, page],
  );

  const { data: memberPage, isLoading, isError, error, refetch, isFetching } = useMembers(filters);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set('search', debouncedSearch);
    if (language) next.set('language', language);
    if (timezone) next.set('timezone', timezone);
    setParams(next, { replace: true });
  }, [debouncedSearch, language, timezone, setParams]);

  const members = memberPage?.data ?? [];
  const meta = memberPage?.meta;
  const activeFilters = [teachesSkillId, wantsSkillId, language, timezone, format].filter(Boolean).length;

  const reset = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setTeachesSkillId('');
    setWantsSkillId('');
    setLanguage('');
    setTimezone('');
    setFormat('');
    setSort('recent');
    setPage(1);
  };

  const skillOptions = (skills ?? []).slice(0, 120).map((skill: Skill) => ({
    value: skill.id,
    label: `${skill.name} — ${skill.category.name}`,
  }));

  return (
    <PageContainer>
      <Reveal>
        <h1 className="ss-heading-page">Member directory</h1>
        <p className="mt-2 max-w-2xl ss-muted">
          Every profile here is a real account. Email addresses and other private details are never returned
          by the public directory.
        </p>
      </Reveal>

      {/* Search and filter bar */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
          <input
            type="search"
            className="ss-input pl-10"
            placeholder="Search by name, username or skill…"
            value={searchInput}
            aria-label="Search members"
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-[rgb(var(--ss-text-subtle))] hover:text-[rgb(var(--ss-text))]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="member-filters"
          leftIcon={<Filter className="h-4 w-4" aria-hidden="true" />}
        >
          Filters
          {activeFilters > 0 ? (
            <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
              {activeFilters}
            </span>
          ) : null}
        </Button>
      </div>

      {showFilters ? (
        <Card id="member-filters" className="mt-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              label="Teaches skill"
              value={teachesSkillId}
              onChange={(event) => {
                setTeachesSkillId(event.target.value);
                setPage(1);
              }}
              placeholder="Any skill"
              options={skillOptions}
            />
            <SelectField
              label="Wants to learn"
              value={wantsSkillId}
              onChange={(event) => {
                setWantsSkillId(event.target.value);
                setPage(1);
              }}
              placeholder="Any skill"
              options={skillOptions}
            />
            <SelectField
              label="Speaks language"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setPage(1);
              }}
              placeholder="Any language"
              options={[
                'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Japanese',
                'Mandarin', 'Hindi', 'Arabic', 'Russian', 'Polish', 'Swahili', 'Dutch',
              ].map((item) => ({ value: item, label: item }))}
            />
            <SelectField
              label="Timezone"
              value={timezone}
              onChange={(event) => {
                setTimezone(event.target.value);
                setPage(1);
              }}
              placeholder="Any timezone"
              options={COMMON_TIMEZONES.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))}
            />
            <SelectField
              label="Session format"
              value={format}
              onChange={(event) => {
                setFormat(event.target.value);
                setPage(1);
              }}
              placeholder="Any format"
              options={[
                { value: 'ONLINE', label: 'Online' },
                { value: 'IN_PERSON', label: 'In person' },
                { value: 'EITHER', label: 'Either' },
              ]}
            />
            <SelectField
              label="Sort by"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
              options={[
                { value: 'recent', label: 'Recently active' },
                { value: 'rating', label: 'Highest rated' },
                { value: 'name', label: 'Name (A–Z)' },
              ]}
            />
          </div>
          <Button
            variant="ghost"
            className="mt-4"
            onClick={reset}
            leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
          >
            Reset filters
          </Button>
        </Card>
      ) : null}

      {/* Results */}
      <p className="mt-6 text-sm ss-muted" aria-live="polite">
        {isLoading
          ? 'Loading members…'
          : meta
            ? `${formatNumber(meta.total)} ${pluralise(meta.total, 'member')}`
            : 'No members'}
        {isFetching && !isLoading ? ' · updating…' : ''}
      </p>

      <div className="mt-4">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonGrid count={6} columns={3} />
        ) : members.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" aria-hidden="true" />}
            title="No members match those filters"
            description="Try a broader search, or clear the filters and browse everyone."
            action={<Button onClick={reset} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>Clear filters</Button>}
          />
        ) : (
          <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <StaggerItem key={member.id}>
                <Link to={`/members/${member.username}`} className="block h-full">
                  <Card interactive className="flex h-full flex-col p-5">
                    <div className="flex items-start gap-3">
                      <Avatar name={member.displayName} src={member.avatarUrl} seed={member.username} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h2 className="truncate font-display text-base font-semibold">{member.displayName}</h2>
                          {member.emailVerified ? (
                            <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Verified member" />
                          ) : null}
                        </div>
                        <p className="truncate text-xs ss-subtle">@{member.username}</p>
                        {member.location ? (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs ss-subtle">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {member.location}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {member.headline ? (
                      <p className="ss-clamp-2 mt-3 text-sm ss-muted">{member.headline}</p>
                    ) : null}

                    {member.teaches.length > 0 ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                          Can teach
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {member.teaches.slice(0, 3).map((skill) => (
                            <SkillChip key={skill.skillId} name={skill.name} tone="brand" />
                          ))}
                          {member.teaches.length > 3 ? (
                            <span className="self-center text-xs ss-subtle">+{member.teaches.length - 3}</span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {member.wants.length > 0 ? (
                      <div className="mt-2.5">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                          Wants to learn
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {member.wants.slice(0, 3).map((skill) => (
                            <SkillChip key={skill.skillId} name={skill.name} tone="learn" />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-auto space-y-2 pt-4">
                      {member.availability.length > 0 ? (
                        <p className="flex flex-wrap items-center gap-1 text-xs ss-subtle">
                          {member.availability.slice(0, 2).map((window, index) => (
                            <span key={index} className="rounded-full bg-[rgb(var(--ss-border)/0.6)] px-2 py-0.5">
                              {weekdayName(window.weekday, true)}
                            </span>
                          ))}
                          {member.availability.length > 2 ? (
                            <span>+{member.availability.length - 2} more windows</span>
                          ) : null}
                        </p>
                      ) : null}

                      <div className="flex items-center justify-between gap-2 border-t pt-3">
                        <div className="flex items-center gap-3 text-xs ss-subtle">
                          <span>{member.stats.completedExchanges} completed</span>
                          {member.stats.averageRating !== null ? (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                              {member.stats.averageRating.toFixed(1)}
                              <span>({member.stats.reviewsCount})</span>
                            </span>
                          ) : (
                            <span>No reviews yet</span>
                          )}
                        </div>
                        {member.languages.length > 0 ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs ss-subtle">
                            <Languages className="h-3 w-3" aria-hidden="true" />
                            {member.languages.length}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pagination">
          <Button variant="secondary" size="sm" disabled={!meta.hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <p className="text-sm ss-muted">
            Page {meta.page} of {meta.totalPages}
          </p>
          <Button variant="secondary" size="sm" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </nav>
      ) : null}
    </PageContainer>
  );
}
