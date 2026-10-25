import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  CornerDownRight,
  ExternalLink,
  Flag,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import {
  useCommunityPost,
  useCreateComment,
  useMarkAnswer,
  useReportContent,
  useVoteComment,
  useVotePost,
} from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { cn, pluralise, relativeTime } from '@/lib/utils';
import type { CommunityCommentItem } from '@/lib/types';

export default function CommunityPostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated, isVerified } = useAuth();

  const { data, isLoading, isError, error, refetch } = useCommunityPost(id);
  const votePost = useVotePost();
  const voteComment = useVoteComment();
  const createComment = useCreateComment();
  const markAnswer = useMarkAnswer();
  const reportContent = useReportContent();

  const [reply, setReply] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityCommentItem | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('SPAM');
  const [reportDetails, setReportDetails] = useState('');

  if (isLoading) {
    return (
      <PageContainer size="narrow">
        <LoadingState label="Loading the discussion" />
      </PageContainer>
    );
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.isNotFound;
    return (
      <PageContainer size="narrow">
        {notFound ? (
          <EmptyState
            icon={<BookOpen className="h-7 w-7" aria-hidden="true" />}
            title="That post could not be found"
            description="It may have been removed by a moderator, or the link may be wrong."
            action={
              <Link to="/community">
                <Button>Back to community</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}
      </PageContainer>
    );
  }

  const { post, comments } = data;
  const isQuestion = post.postType === 'QUESTION';
  const accepted = comments.find((comment) => comment.isAnswer);
  const canMarkAnswer = isQuestion && post.isMine;

  // Accepted answer first, then by votes, then oldest.
  const ordered = [...comments].sort((a, b) => {
    if (a.isAnswer !== b.isAnswer) return a.isAnswer ? -1 : 1;
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const submitReply = async () => {
    if (reply.trim().length < 2) return;
    try {
      await createComment.mutateAsync({
        postId: post.id,
        body: reply.trim(),
        parentId: replyTo?.id,
      });
      toast.success('Reply posted');
      setReply('');
      setReplyTo(null);
    } catch (err) {
      toast.error('Could not post the reply', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <PageContainer size="narrow">
      <button
        type="button"
        onClick={() => navigate('/community')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm ss-muted transition-colors hover:text-[rgb(var(--ss-text))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Community
      </button>

      {/* ------------------------------------------------------- the post */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={post.postType === 'QUESTION' ? 'info' : post.postType === 'RESOURCE' ? 'success' : 'neutral'}>
              {post.postType.toLowerCase()}
            </Badge>
            {post.category ? <Badge variant="brand">{post.category.name}</Badge> : null}
            {post.skill ? <span className="text-xs ss-subtle">{post.skill.name}</span> : null}
            {post.pinned ? <Badge variant="warning">Pinned</Badge> : null}
            {isQuestion && accepted ? <Badge variant="success">Answered</Badge> : null}
          </div>

          <h1 className="font-display text-2xl font-bold">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ss-subtle">
            <Link to={`/members/${post.author.username}`} className="flex items-center gap-2">
              <Avatar
                name={post.author.displayName}
                src={post.author.avatarUrl}
                seed={post.author.username}
                size="sm"
              />
              <span className="font-medium text-[rgb(var(--ss-text))]">{post.author.displayName}</span>
            </Link>
            <span>{relativeTime(post.createdAt)}</span>
            {post.updatedAt !== post.createdAt ? <span>edited {relativeTime(post.updatedAt)}</span> : null}
          </div>

          <div className="whitespace-pre-line text-sm leading-relaxed ss-muted">{post.body}</div>

          {post.resourceUrl ? (
            <a
              href={post.resourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-50/60 px-4 py-3 text-sm font-medium transition-colors hover:border-brand-500 dark:bg-brand-500/5"
            >
              <ExternalLink className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />
              <span className="break-all">{post.resourceUrl}</span>
            </a>
          ) : null}

          {/* Voting and actions */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <div className="flex items-center gap-1 rounded-xl border p-1">
              <button
                type="button"
                disabled={!isAuthenticated || !isVerified}
                onClick={() =>
                  votePost.mutate(
                    { id: post.id, value: post.myVote === 1 ? 0 : 1 },
                    { onError: (err) => toast.error('Could not vote', err instanceof ApiError ? err.message : undefined) },
                  )
                }
                aria-label="Upvote this post"
                aria-pressed={post.myVote === 1}
                title={!isVerified ? 'Verify your email to vote' : undefined}
                className={cn(
                  'rounded-lg p-2 transition-colors disabled:opacity-50',
                  post.myVote === 1 ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'ss-subtle hover:bg-[rgb(var(--ss-border)/0.6)]',
                )}
              >
                <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-[2ch] text-center text-sm font-bold tabular-nums">{post.voteCount}</span>
              <button
                type="button"
                disabled={!isAuthenticated || !isVerified}
                onClick={() =>
                  votePost.mutate(
                    { id: post.id, value: post.myVote === -1 ? 0 : -1 },
                    { onError: (err) => toast.error('Could not vote', err instanceof ApiError ? err.message : undefined) },
                  )
                }
                aria-label="Downvote this post"
                aria-pressed={post.myVote === -1}
                className={cn(
                  'rounded-lg p-2 transition-colors disabled:opacity-50',
                  post.myVote === -1 ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : 'ss-subtle hover:bg-[rgb(var(--ss-border)/0.6)]',
                )}
              >
                <ThumbsDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <span className="text-sm ss-subtle">
              {comments.length} {pluralise(comments.length, 'reply', 'replies')}
            </span>

            <button
              type="button"
              disabled={!isAuthenticated}
              onClick={() => setReporting(post.id)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ss-subtle transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              Report
            </button>
          </div>
        </CardBody>
      </Card>

      {/* ---------------------------------------------------- accepted answer */}
      {accepted ? (
        <Card className="mt-6 border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/5">
          <CardHeader
            title="Accepted answer"
            description="Marked by the person who asked."
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            <CommentBody
              comment={accepted}
              onReply={setReplyTo}
              onVote={(value) => voteComment.mutate({ id: accepted.id, value })}
              onReport={() => setReporting(accepted.id)}
              onMarkAnswer={undefined}
              canInteract={isAuthenticated && isVerified}
              highlight
            />
          </CardBody>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------- replies */}
      <Card className="mt-6">
        <CardHeader
          title={isQuestion ? 'Answers' : 'Replies'}
          description={`${comments.length} ${pluralise(comments.length, 'reply', 'replies')}`}
          icon={<CornerDownRight className="h-4 w-4" aria-hidden="true" />}
        />
        <CardBody className="space-y-5">
          {comments.length === 0 ? (
            <EmptyState
              compact
              icon={<CornerDownRight className="h-6 w-6" aria-hidden="true" />}
              title="No replies yet"
              description={isQuestion ? 'Be the first to answer. Clear, complete answers get marked as accepted.' : 'Add your thoughts below.'}
            />
          ) : (
            <ul className="space-y-5">
              {ordered.map((comment) => (
                <li key={comment.id}>
                  <CommentBody
                    comment={comment}
                    onReply={setReplyTo}
                    onVote={(value) => voteComment.mutate({ id: comment.id, value })}
                    onReport={() => setReporting(comment.id)}
                    onMarkAnswer={
                      canMarkAnswer
                        ? () =>
                            markAnswer.mutate(
                              { id: comment.id, postId: post.id },
                              {
                                onSuccess: () => toast.success('Accepted answer updated'),
                                onError: (err) =>
                                  toast.error('Could not mark the answer', err instanceof ApiError ? err.message : undefined),
                              },
                            )
                        : undefined
                    }
                    canInteract={isAuthenticated && isVerified}
                    highlight={comment.isAnswer}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Composer */}
          {isAuthenticated ? (
            <div className="border-t pt-5">
              {replyTo ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border bg-[rgb(var(--ss-bg))] px-3.5 py-2.5 text-xs">
                  <span className="truncate ss-muted">
                    Replying to <strong>{replyTo.author.displayName}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
              <TextAreaField
                label={replyTo ? 'Your reply' : isQuestion ? 'Your answer' : 'Your reply'}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                maxLength={4000}
                showCount
                placeholder={
                  isQuestion
                    ? 'Explain what worked for you and why. Include the trade-offs.'
                    : 'Add to the discussion.'
                }
                hint={!isVerified ? 'Verify your email address to post replies.' : undefined}
              />
              <Button
                className="mt-3"
                onClick={submitReply}
                loading={createComment.isPending}
                disabled={reply.trim().length < 2 || !isVerified}
              >
                Post {replyTo ? 'reply' : isQuestion ? 'answer' : 'reply'}
              </Button>
            </div>
          ) : (
            <div className="border-t pt-5 text-center">
              <p className="text-sm ss-muted">
                <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  Sign in
                </Link>{' '}
                to join the discussion.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------- report modal */}
      <Modal
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        title="Report content"
        description="Reports go to the moderation queue. Your name is not shown to the author."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReporting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={reportContent.isPending}
              onClick={() => {
                if (!reporting) return;
                const isPost = reporting === post.id;
                reportContent.mutate(
                  {
                    targetType: isPost ? 'COMMUNITY_POST' : 'COMMUNITY_COMMENT',
                    targetId: reporting,
                    reason: reportReason,
                    details: reportDetails.trim() || undefined,
                  },
                  {
                    onSuccess: () => {
                      toast.success('Report submitted', 'A moderator will review it.');
                      setReporting(null);
                      setReportDetails('');
                    },
                    onError: (err) =>
                      toast.error('Could not submit', err instanceof ApiError ? err.message : undefined),
                  },
                );
              }}
            >
              Submit report
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Reason"
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            options={[
              { value: 'SPAM', label: 'Spam or advertising' },
              { value: 'HARASSMENT', label: 'Harassment or abuse' },
              { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate content' },
              { value: 'OFF_TOPIC', label: 'Off topic or disruptive' },
              { value: 'OTHER', label: 'Something else' },
            ]}
          />
          <TextAreaField
            label="Details"
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            maxLength={2000}
            showCount
          />
        </div>
      </Modal>
    </PageContainer>
  );
}

function CommentBody({
  comment,
  onReply,
  onVote,
  onReport,
  onMarkAnswer,
  canInteract,
  highlight,
}: {
  comment: CommunityCommentItem;
  onReply: (comment: CommunityCommentItem) => void;
  onVote: (value: number) => void;
  onReport: () => void;
  onMarkAnswer?: () => void;
  canInteract: boolean;
  highlight?: boolean;
}) {
  const { user } = useAuth();
  const isOwn = comment.author.username === user?.username;

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        highlight && 'border-emerald-500/40 bg-[rgb(var(--ss-bg))]',
      )}
    >
      <div className="flex items-start gap-3">
        <Link to={`/members/${comment.author.username}`} className="shrink-0">
          <Avatar
            name={comment.author.displayName}
            src={comment.author.avatarUrl}
            seed={comment.author.username}
            size="sm"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/members/${comment.author.username}`} className="text-sm font-semibold hover:underline">
              {comment.author.displayName}
            </Link>
            {comment.isAnswer ? (
              <Badge variant="success" icon={<CheckCircle2 className="h-3 w-3" aria-hidden="true" />}>
                Accepted answer
              </Badge>
            ) : null}
            <span className="text-xs ss-subtle">{relativeTime(comment.createdAt)}</span>
          </div>

          <p className="mt-2 whitespace-pre-line text-sm ss-muted">{comment.body}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canInteract}
                onClick={() => onVote(comment.myVote === 1 ? 0 : 1)}
                aria-label="Upvote"
                aria-pressed={comment.myVote === 1}
                className={cn(
                  'rounded-lg p-1.5 transition-colors disabled:opacity-50',
                  comment.myVote === 1 ? 'text-brand-600 dark:text-brand-300' : 'ss-subtle hover:bg-[rgb(var(--ss-border)/0.6)]',
                )}
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="text-xs font-semibold tabular-nums">{comment.voteCount}</span>
              <button
                type="button"
                disabled={!canInteract}
                onClick={() => onVote(comment.myVote === -1 ? 0 : -1)}
                aria-label="Downvote"
                aria-pressed={comment.myVote === -1}
                className={cn(
                  'rounded-lg p-1.5 transition-colors disabled:opacity-50',
                  comment.myVote === -1 ? 'text-rose-600 dark:text-rose-400' : 'ss-subtle hover:bg-[rgb(var(--ss-border)/0.6)]',
                )}
              >
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            {canInteract ? (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="text-xs font-medium ss-subtle transition-colors hover:text-[rgb(var(--ss-text))]"
              >
                Reply
              </button>
            ) : null}

            {onMarkAnswer && !comment.isAnswer && !isOwn ? (
              <button
                type="button"
                onClick={onMarkAnswer}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 transition-colors hover:underline dark:text-emerald-400"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Mark as accepted answer
              </button>
            ) : null}

            {canInteract && !isOwn ? (
              <button
                type="button"
                onClick={onReport}
                className="ml-auto inline-flex items-center gap-1 text-xs ss-subtle transition-colors hover:text-rose-600 dark:hover:text-rose-400"
              >
                <Flag className="h-3 w-3" aria-hidden="true" />
                Report
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
