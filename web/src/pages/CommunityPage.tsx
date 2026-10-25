import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
  HelpCircle,
  MessageSquare,
  PenSquare,
  RotateCcw,
  Search,
  Share2,
  ThumbsUp,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { SkillPicker } from '@/components/SkillPicker';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { StaggerItem, StaggerList } from '@/components/animations/Motion';
import { useCategories, useCommunityPosts, useCreatePost } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { cn, formatNumber, pluralise, relativeTime } from '@/lib/utils';
import type { CommunityPostSummary } from '@/lib/types';

const POST_TYPES = [
  { value: 'DISCUSSION', label: 'Discussion', icon: MessageSquare },
  { value: 'QUESTION', label: 'Question', icon: HelpCircle },
  { value: 'RESOURCE', label: 'Resource', icon: Share2 },
];

export default function CommunityPage() {
  const toast = useToast();
  const { isAuthenticated, isVerified } = useAuth();
  const [params, setParams] = useSearchParams();

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [debounced, setDebounced] = useState(searchInput);
  const [categorySlug, setCategorySlug] = useState(params.get('category') ?? '');
  const [postType, setPostType] = useState(params.get('type') ?? '');
  const [sort, setSort] = useState(params.get('sort') ?? 'recent');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newType, setNewType] = useState('DISCUSSION');
  const [newCategory, setNewCategory] = useState('');
  const [newSkill, setNewSkill] = useState<{ id: string; name: string } | null>(null);
  const [newResourceUrl, setNewResourceUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: categories } = useCategories();
  const createPost = useCreatePost();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const selectedCategory = useMemo(
    () => categories?.find((category) => category.slug === categorySlug),
    [categories, categorySlug],
  );

  const filters = useMemo(
    () => ({
      search: debounced || undefined,
      categoryId: selectedCategory?.id,
      postType: postType || undefined,
      sort,
      page,
      pageSize: 10,
    }),
    [debounced, selectedCategory?.id, postType, sort, page],
  );

  const { data: postPage, isLoading, isError, error, refetch, isFetching } = useCommunityPosts(filters);

  useEffect(() => {
    const next = new URLSearchParams();
    if (debounced) next.set('search', debounced);
    if (categorySlug) next.set('category', categorySlug);
    if (postType) next.set('type', postType);
    if (sort !== 'recent') next.set('sort', sort);
    setParams(next, { replace: true });
  }, [debounced, categorySlug, postType, sort, setParams]);

  const posts = postPage?.data ?? [];
  const meta = postPage?.meta;

  const reset = () => {
    setSearchInput('');
    setDebounced('');
    setCategorySlug('');
    setPostType('');
    setSort('recent');
    setPage(1);
  };

  const submitPost = async () => {
    setFormError(null);
    if (newTitle.trim().length < 5) {
      setFormError('Give your post a clear title of at least 5 characters.');
      return;
    }
    if (newBody.trim().length < 10) {
      setFormError('Add a bit more detail — at least 10 characters.');
      return;
    }
    try {
      await createPost.mutateAsync({
        title: newTitle.trim(),
        body: newBody.trim(),
        postType: newType,
        categoryId: (selectedCategory?.id ?? newCategory) || undefined,
        skillId: newSkill?.id,
        resourceUrl: newResourceUrl.trim() || undefined,
      });
      toast.success('Posted', 'Your post is live in the community.');
      setComposeOpen(false);
      setNewTitle('');
      setNewBody('');
      setNewSkill(null);
      setNewResourceUrl('');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'We could not publish that post.');
    }
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Community</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Ask questions, share what you learned and post resources. Answers can be marked as accepted by the
            person who asked.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAuthenticated ? (
            <Button
              onClick={() => setComposeOpen(true)}
              disabled={!isVerified}
              title={!isVerified ? 'Verify your email address to post' : undefined}
              leftIcon={<PenSquare className="h-4 w-4" aria-hidden="true" />}
            >
              New post
            </Button>
          ) : (
            <Link to="/register">
              <Button>Join to post</Button>
            </Link>
          )}
        </div>
      </div>

      {isAuthenticated && !isVerified ? (
        <p className="mt-4 rounded-xl border border-amber-500/35 bg-amber-50/60 px-4 py-3 text-sm dark:bg-amber-500/5">
          You can read everything, but posting and voting need a verified email address. Verify it from your
          settings page.
        </p>
      ) : null}

      {/* Search and filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
          <input
            type="search"
            className="ss-input pl-10"
            placeholder="Search discussions, questions and resources…"
            value={searchInput}
            aria-label="Search community posts"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="community-filters"
          leftIcon={<Filter className="h-4 w-4" aria-hidden="true" />}
        >
          Filters
        </Button>
      </div>

      {showFilters ? (
        <Card id="community-filters" className="mt-4">
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Type"
                value={postType}
                onChange={(event) => {
                  setPostType(event.target.value);
                  setPage(1);
                }}
                placeholder="All types"
                options={POST_TYPES.map((type) => ({ value: type.value, label: type.label }))}
              />
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
                label="Sort by"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
                options={[
                  { value: 'recent', label: 'Newest first' },
                  { value: 'top', label: 'Most upvoted' },
                  { value: 'active', label: 'Most replies' },
                ]}
              />
            </div>
            <Button variant="ghost" className="mt-4" onClick={reset} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
              Reset filters
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {/* Category chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategorySlug('')}
          aria-pressed={categorySlug === ''}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
            categorySlug === '' ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'hover:border-[rgb(var(--ss-ring))]',
          )}
        >
          All
        </button>
        {(categories ?? []).map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategorySlug(category.slug === categorySlug ? '' : category.slug)}
            aria-pressed={categorySlug === category.slug}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              categorySlug === category.slug
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15'
                : 'hover:border-[rgb(var(--ss-ring))]',
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      <p className="mt-6 text-sm ss-muted" aria-live="polite">
        {isLoading
          ? 'Loading posts…'
          : meta
            ? `${formatNumber(meta.total)} ${pluralise(meta.total, 'post')}`
            : 'No posts'}
        {isFetching && !isLoading ? ' · updating…' : ''}
      </p>

      {/* Posts */}
      <div className="mt-4">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <Card>
            <CardBody>
              <SkeletonRows count={6} />
            </CardBody>
          </Card>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-7 w-7" aria-hidden="true" />}
            title={debounced ? 'No posts match your search' : 'No posts yet'}
            description={
              debounced
                ? 'Try a broader search term, or clear the filters.'
                : 'Be the first to start a discussion. Asking a specific question usually gets a good answer.'
            }
            action={
              debounced ? (
                <Button onClick={reset} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                  Clear filters
                </Button>
              ) : isAuthenticated && isVerified ? (
                <Button onClick={() => setComposeOpen(true)} leftIcon={<PenSquare className="h-4 w-4" aria-hidden="true" />}>
                  Write the first post
                </Button>
              ) : (
                <Link to="/register">
                  <Button>Join the community</Button>
                </Link>
              )
            }
          />
        ) : (
          <StaggerList className="space-y-3">
            {posts.map((post) => (
              <StaggerItem key={post.id}>
                <PostRow post={post} />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Pagination">
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

      {/* Compose */}
      <Modal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="New community post"
        description="Be specific and be kind. Spam and off-topic posts are removed."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitPost} loading={createPost.isPending}>
              Publish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <span className="ss-label">Type</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Post type">
              {POST_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    type="button"
                    role="radio"
                    aria-checked={newType === type.value}
                    onClick={() => setNewType(type.value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
                      newType === type.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'hover:border-[rgb(var(--ss-ring))]',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {type.label}
                  </button>
                );
              })}
            </div>
          </div>

          <TextField
            label="Title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            maxLength={160}
            required
            placeholder={
              newType === 'QUESTION'
                ? 'e.g. How do you structure a large FastAPI project?'
                : 'e.g. Notes from learning React Server Components'
            }
          />

          <TextAreaField
            label="Body"
            value={newBody}
            onChange={(event) => setNewBody(event.target.value)}
            maxLength={5000}
            showCount
            required
            className="min-h-[180px]"
            placeholder="Give enough context that someone can help without asking follow-up questions."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Category"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="Pick a category"
              options={(categories ?? []).map((category) => ({ value: category.id, label: category.name }))}
            />
            <SkillPicker label="Related skill (optional)" value={newSkill} onChange={setNewSkill} />
          </div>

          {newType === 'RESOURCE' ? (
            <TextField
              label="Resource link"
              type="url"
              value={newResourceUrl}
              onChange={(event) => setNewResourceUrl(event.target.value)}
              placeholder="https://…"
              hint="Shown prominently with your post."
            />
          ) : null}

          {formError ? (
            <p role="alert" className="rounded-lg border border-rose-500/35 bg-rose-50/60 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300">
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>
    </PageContainer>
  );
}

function PostRow({ post }: { post: CommunityPostSummary }) {
  return (
    <Card interactive className="p-5">
      <div className="flex gap-4">
        {/* Vote column */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--ss-border)/0.7)]">
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold tabular-nums">{post.voteCount}</span>
          <span className="text-[10px] ss-subtle">votes</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.postType === 'QUESTION' ? 'info' : post.postType === 'RESOURCE' ? 'success' : 'neutral'}>
              {post.postType.toLowerCase()}
            </Badge>
            {post.category ? <Badge variant="brand">{post.category.name}</Badge> : null}
            {post.skill ? <span className="text-xs ss-subtle">{post.skill.name}</span> : null}
            {post.pinned ? <Badge variant="warning">Pinned</Badge> : null}
          </div>

          <h2 className="mt-2">
            <Link
              to={`/community/posts/${post.id}`}
              className="font-display text-base font-semibold transition-colors hover:text-brand-600 dark:hover:text-brand-300"
            >
              {post.title}
            </Link>
          </h2>

          <p className="ss-clamp-2 mt-1.5 text-sm ss-muted">{post.excerpt}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ss-subtle">
            <Link to={`/members/${post.author.username}`} className="flex items-center gap-1.5">
              <Avatar
                name={post.author.displayName}
                src={post.author.avatarUrl}
                seed={post.author.username}
                size="xs"
              />
              {post.author.displayName}
            </Link>
            <span>{relativeTime(post.createdAt)}</span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {post.commentCount} {pluralise(post.commentCount, 'reply', 'replies')}
            </span>
            {post.resourceUrl ? (
              <a
                href={post.resourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                Resource link
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
