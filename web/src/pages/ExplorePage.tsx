import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Compass,
  Filter,
  GraduationCap,
  Grid3x3,
  List,
  RotateCcw,
  Search,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SelectField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/Feedback';
import { Reveal, StaggerItem, StaggerList } from '@/components/animations/Motion';
import { useCategories, useMembers, useSkillSearch, useTrendingSkills } from '@/hooks/queries';
import { cn, formatNumber, pluralise } from '@/lib/utils';
import type { Skill } from '@/lib/types';

type ViewMode = 'grid' | 'list';

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);
  const [categorySlug, setCategorySlug] = useState(params.get('category') ?? '');
  const [skillSlug, setSkillSlug] = useState(params.get('skill') ?? '');
  const [level, setLevel] = useState(params.get('level') ?? '');
  const [language, setLanguage] = useState(params.get('language') ?? '');
  const [timezone, setTimezone] = useState(params.get('timezone') ?? '');
  const [format, setFormat] = useState(params.get('format') ?? '');
  const [sort, setSort] = useState(params.get('sort') ?? 'recent');
  const [view, setView] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data: categories } = useCategories();
  const { data: trending, isLoading: trendingLoading } = useTrendingSkills(10);

  // Debounce the free-text search.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const selectedCategory = useMemo(
    () => categories?.find((category) => category.slug === categorySlug),
    [categories, categorySlug],
  );

  const { data: skillMatches } = useSkillSearch(debouncedSearch, selectedCategory?.id, true);

  // Resolve a skill slug from the URL or a picked skill into its id.
  const selectedSkillId = useMemo(() => {
    if (!skillSlug) return undefined;
    return skillMatches?.find((skill: Skill) => skill.slug === skillSlug)?.id;
  }, [skillMatches, skillSlug]);

  const memberFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      teachesSkillId: selectedSkillId,
      language: language || undefined,
      timezone: timezone || undefined,
      format: format || undefined,
      sort,
      page,
      pageSize: 12,
    }),
    [debouncedSearch, selectedSkillId, language, timezone, format, sort, page],
  );

  const { data: memberPage, isLoading, isError, error, refetch, isFetching } = useMembers(memberFilters);

  // Keep the URL in step so results can be shared or bookmarked.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set('search', debouncedSearch);
    if (categorySlug) next.set('category', categorySlug);
    if (skillSlug) next.set('skill', skillSlug);
    if (language) next.set('language', language);
    if (timezone) next.set('timezone', timezone);
    if (format) next.set('format', format);
    if (sort !== 'recent') next.set('sort', sort);
    setParams(next, { replace: true });
  }, [debouncedSearch, categorySlug, skillSlug, language, timezone, format, sort, setParams]);

  const members = memberPage?.data ?? [];
  const meta = memberPage?.meta;

  const activeFilterCount = [categorySlug, skillSlug, language, timezone, format].filter(Boolean).length;

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setCategorySlug('');
    setSkillSlug('');
    setLevel('');
    setLanguage('');
    setTimezone('');
    setFormat('');
    setSort('recent');
    setPage(1);
  };

  return (
    <PageContainer>
      {/* -------------------------------------------------------- header */}
      <div className="ss-hero-bg -mx-4 mb-8 rounded-3xl border px-6 py-10 sm:mx-0 sm:px-10">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/12 dark:text-brand-300">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Explore
          </span>
          <h1 className="ss-heading-page mt-4">Find someone to exchange with</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Search by skill, language, timezone or session format. Counts come from members who have actually
            listed each skill.
          </p>
        </Reveal>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
            <input
              type="search"
              className="ss-input pl-10"
              placeholder="Search skills, names or keywords…"
              value={searchInput}
              aria-label="Search skills and members"
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
            aria-controls="filter-panel"
            leftIcon={<Filter className="h-4 w-4" aria-hidden="true" />}
          >
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
          <div className="flex items-center gap-1 rounded-xl border p-1" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              className={cn('rounded-lg p-2 transition-colors', view === 'grid' ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'ss-subtle')}
            >
              <Grid3x3 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              aria-label="List view"
              className={cn('rounded-lg p-2 transition-colors', view === 'list' ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'ss-subtle')}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- filters */}
      {showFilters ? (
        <Card id="filter-panel" className="mb-8 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Category"
              value={categorySlug}
              onChange={(event) => {
                setCategorySlug(event.target.value);
                setPage(1);
              }}
              placeholder="All categories"
              options={(categories ?? []).map((category) => ({
                value: category.slug,
                label: `${category.name} (${category.skillCount})`,
              }))}
            />
            <SelectField
              label="Specific skill"
              value={skillSlug}
              onChange={(event) => {
                setSkillSlug(event.target.value);
                setPage(1);
              }}
              placeholder="Any skill"
              options={(skillMatches ?? []).map((skill: Skill) => ({ value: skill.slug, label: skill.name }))}
            />
            <SelectField
              label="Level you can teach at"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              placeholder="Any level"
              options={[
                { value: 'BEGINNER', label: 'Beginner' },
                { value: 'INTERMEDIATE', label: 'Intermediate' },
                { value: 'ADVANCED', label: 'Advanced' },
                { value: 'EXPERT', label: 'Expert' },
              ]}
              hint="Shown on member profiles."
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
            <TextField
              label="Language"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setPage(1);
              }}
              placeholder="e.g. Spanish"
            />
            <TextField
              label="Timezone"
              value={timezone}
              onChange={(event) => {
                setTimezone(event.target.value);
                setPage(1);
              }}
              placeholder="e.g. Europe/London"
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
            <div className="flex items-end">
              <Button
                variant="ghost"
                fullWidth
                onClick={resetFilters}
                leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
              >
                Reset filters
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* --------------------------------------------------- trending row */}
      <section aria-labelledby="trending-heading" className="mb-8">
        <h2 id="trending-heading" className="ss-heading-section">
          Trending skills
        </h2>
        <p className="mt-1 text-sm ss-muted">Ranked by teacher and learner counts across the platform.</p>
        {trendingLoading ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="ss-skeleton h-8 w-32 rounded-full" />
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {(trending ?? []).map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => {
                  setSkillSlug(skill.slug);
                  setCategorySlug('');
                  setPage(1);
                }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 hover:border-[rgb(var(--ss-ring))]',
                  skillSlug === skill.slug && 'border-brand-500 bg-brand-50 dark:bg-brand-500/15',
                )}
              >
                <TrendingUp className="h-3 w-3 text-brand-500" aria-hidden="true" />
                {skill.name}
                <span className="ss-subtle">
                  {skill.teachers}T · {skill.learners}L
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------- categories */}
      <section aria-labelledby="categories-heading" className="mb-10">
        <h2 id="categories-heading" className="ss-heading-section">
          Browse by category
        </h2>
        <StaggerList className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(categories ?? []).map((category) => (
            <StaggerItem key={category.id}>
              <button
                type="button"
                onClick={() => {
                  setCategorySlug(category.slug === categorySlug ? '' : category.slug);
                  setSkillSlug('');
                  setPage(1);
                }}
                aria-pressed={categorySlug === category.slug}
                className={cn(
                  'w-full rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--ss-ring))] hover:shadow-glow-sm',
                  categorySlug === category.slug && 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{category.name}</span>
                  <Badge variant="brand">{category.skillCount}</Badge>
                </div>
                <p className="ss-clamp-2 mt-1.5 text-xs ss-muted">{category.description}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs ss-subtle">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {formatNumber(category.teacherCount)} teaching
                </p>
              </button>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      {/* ------------------------------------------------------ results */}
      <section aria-labelledby="results-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="results-heading" className="ss-heading-section">
              {selectedCategory ? `${selectedCategory.name} members` : 'Members'}
            </h2>
            <p className="mt-1 text-sm ss-muted" aria-live="polite">
              {isLoading
                ? 'Searching…'
                : meta
                  ? `${formatNumber(meta.total)} ${pluralise(meta.total, 'member')} found`
                  : 'No results'}
              {isFetching && !isLoading ? ' · updating…' : ''}
            </p>
          </div>
        </div>

        <div className="mt-5">
          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading ? (
            <SkeletonGrid count={6} columns={3} />
          ) : members.length === 0 ? (
            <EmptyState
              icon={<Search className="h-7 w-7" aria-hidden="true" />}
              title="No members match those filters"
              description={
                debouncedSearch
                  ? `Nothing matched “${debouncedSearch}” with the filters you set. Try widening the search.`
                  : 'Try removing a filter or two, or browse by category instead.'
              }
              action={
                <Button onClick={resetFilters} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                  Clear all filters
                </Button>
              }
              secondaryAction={
                <Link to="/members">
                  <Button variant="secondary">Browse all members</Button>
                </Link>
              }
            />
          ) : view === 'grid' ? (
            <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => (
                <StaggerItem key={member.id}>
                  <Link to={`/members/${member.username}`} className="block h-full">
                    <Card interactive className="flex h-full flex-col p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft font-display text-lg font-bold text-brand-700 dark:text-brand-300">
                          {member.displayName.charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold">{member.displayName}</h3>
                          <p className="truncate text-xs ss-subtle">@{member.username}</p>
                          {member.location ? (
                            <p className="truncate text-xs ss-subtle">{member.location}</p>
                          ) : null}
                        </div>
                      </div>
                      {member.headline ? (
                        <p className="ss-clamp-2 mt-3 flex-1 text-sm ss-muted">{member.headline}</p>
                      ) : null}
                      {member.teaches.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {member.teaches.slice(0, 3).map((skill) => (
                            <span key={skill.skillId} className="ss-badge-brand">
                              {skill.name}
                            </span>
                          ))}
                          {member.teaches.length > 3 ? (
                            <span className="self-center text-xs ss-subtle">+{member.teaches.length - 3}</span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-4 flex items-center gap-3 border-t pt-3 text-xs ss-subtle">
                        <span className="flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                          {member.stats.completedExchanges} completed
                        </span>
                        {member.stats.averageRating !== null ? (
                          <span>{member.stats.averageRating.toFixed(1)} ★</span>
                        ) : null}
                      </div>
                    </Card>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
          ) : (
            <ul className="space-y-3">
              {members.map((member) => (
                <li key={member.id}>
                  <Card interactive className="flex flex-wrap items-center gap-4 p-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft font-display text-lg font-bold text-brand-700 dark:text-brand-300">
                      {member.displayName.charAt(0)}
                    </span>
                    <div className="min-w-[200px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{member.displayName}</h3>
                        <span className="text-xs ss-subtle">@{member.username}</span>
                        {member.location ? <span className="text-xs ss-subtle">· {member.location}</span> : null}
                      </div>
                      {member.headline ? (
                        <p className="ss-clamp-2 mt-1 text-sm ss-muted">{member.headline}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {member.teaches.slice(0, 2).map((skill) => (
                        <span key={skill.skillId} className="ss-badge-brand">
                          {skill.name}
                        </span>
                      ))}
                    </div>
                    <Link to={`/members/${member.username}`}>
                      <Button size="sm" variant="secondary">
                        View profile
                      </Button>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
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
      </section>
    </PageContainer>
  );
}
