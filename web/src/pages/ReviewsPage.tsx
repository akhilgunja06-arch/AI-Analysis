import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, MessageSquareQuote, Star, ThumbsUp } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { ProgressBar } from '@/components/animations/Motion';
import { useCreateReview, useMemberReviews, usePendingReviews, useReportContent } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { cn, formatNumber, pluralise, relativeTime } from '@/lib/utils';

export default function ReviewsPage() {
  const toast = useToast();
  const { user } = useAuth();

  const { data: pending, isLoading: loadingPending, isError, error, refetch } = usePendingReviews();
  const { data: myReviews } = useMemberReviews(user?.username);
  const createReview = useCreateReview();
  const reportContent = useReportContent();

  const [reviewing, setReviewing] = useState<{
    exchangeId: string;
    username: string;
    displayName: string;
    subjectId: string;
  } | null>(null);
  const [rating, setRating] = useState(5);
  const [teachingRating, setTeachingRating] = useState(5);
  const [communicationRating, setCommunicationRating] = useState(5);
  const [reliabilityRating, setReliabilityRating] = useState(5);
  const [comment, setComment] = useState('');

  const [reporting, setReporting] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('INAPPROPRIATE_CONTENT');
  const [reportDetails, setReportDetails] = useState('');

  const openReview = (item: {
    exchangeId: string;
    otherUser: { id: string; username: string; displayName: string } | null;
  }) => {
    if (!item.otherUser) return;
    setRating(5);
    setTeachingRating(5);
    setCommunicationRating(5);
    setReliabilityRating(5);
    setComment('');
    setReviewing({
      exchangeId: item.exchangeId,
      username: item.otherUser.username,
      displayName: item.otherUser.displayName,
      subjectId: item.otherUser.id,
    });
  };

  const submit = async () => {
    if (!reviewing) return;
    try {
      // The server derives the partner from the exchange and rejects any subject
      // that is not the other participant, so we send the exchange only.
      await createReview.mutateAsync({
        exchangeId: reviewing.exchangeId,
        subjectId: reviewing.subjectId,
        rating,
        teachingRating,
        communicationRating,
        reliabilityRating,
        comment: comment.trim() || undefined,
      });
      toast.success('Review submitted', `Your feedback for ${reviewing.displayName} is live.`);
      setReviewing(null);
    } catch (err) {
      toast.error(
        'Could not submit the review',
        err instanceof ApiError ? err.message : 'Please try again.',
      );
    }
  };

  const received = myReviews?.reviews ?? [];
  const average = myReviews?.averageRating ?? null;
  const distribution = myReviews?.distribution ?? {};

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Reviews and reputation</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Reviews are tied to a completed exchange and limited to one per partner, so every rating here comes
            from a real collaboration.
          </p>
        </div>
        <Link to="/exchanges">
          <Button variant="secondary">My exchanges</Button>
        </Link>
      </div>

      {/* Reputation summary */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Your average rating"
          value={average !== null ? average.toFixed(2) : '—'}
          hint={received.length > 0 ? `${received.length} ${pluralise(received.length, 'review')}` : 'No reviews yet'}
          icon={<Star className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
        />
        <StatCard
          label="Reviews received"
          value={formatNumber(received.length)}
          hint="From completed exchanges"
          icon={<MessageSquareQuote className="h-5 w-5" aria-hidden="true" />}
          tone="brand"
        />
        <StatCard
          label="Waiting for your review"
          value={formatNumber(pending?.length ?? 0)}
          hint="Completed exchanges"
          icon={<ThumbsUp className="h-5 w-5" aria-hidden="true" />}
          tone="violet"
        />
        <StatCard
          label="Five-star reviews"
          value={formatNumber(distribution['5'] ?? 0)}
          hint="Of all reviews received"
          icon={<Star className="h-5 w-5" aria-hidden="true" />}
          tone="emerald"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ------------------------------------------------------- pending */}
        <Card>
          <CardHeader
            title="Exchanges awaiting your review"
            description="You can leave one review per partner, and only after both of you confirmed completion."
            icon={<ThumbsUp className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {isError ? (
              <ErrorState error={error} onRetry={() => void refetch()} compact />
            ) : loadingPending ? (
              <SkeletonRows count={3} />
            ) : !pending || pending.length === 0 ? (
              <EmptyState
                compact
                icon={<ThumbsUp className="h-6 w-6" aria-hidden="true" />}
                title="Nothing waiting"
                description="When an exchange completes, it appears here so you can leave feedback for your partner."
                action={
                  <Link to="/exchanges">
                    <Button size="sm" variant="secondary">
                      View exchanges
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {pending.map((item) => (
                  <li key={item.exchangeId} className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
                    <Avatar
                      name={item.otherUser?.displayName ?? 'Partner'}
                      src={item.otherUser?.avatarUrl}
                      seed={item.otherUser?.username}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="truncate text-xs ss-subtle">
                        with {item.otherUser?.displayName ?? 'a partner'}
                        {item.completedAt ? ` · completed ${relativeTime(item.completedAt)}` : ''}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => openReview(item)} leftIcon={<Star className="h-3.5 w-3.5" aria-hidden="true" />}>
                      Write review
                    </Button>
                    <Link to={`/exchanges/${item.exchangeId}`}>
                      <Button size="sm" variant="ghost">
                        Workspace
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* -------------------------------------------------- distribution */}
        <Card>
          <CardHeader
            title="Your rating breakdown"
            description="Calculated from the reviews you have received."
            icon={<Star className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody>
            {received.length === 0 ? (
              <p className="text-sm ss-subtle">
                No reviews yet, so there is nothing to break down. We never show placeholder ratings.
              </p>
            ) : (
              <div className="space-y-2.5">
                {[5, 4, 3, 2, 1].map((score) => {
                  const count = distribution[String(score)] ?? 0;
                  const percent = received.length > 0 ? (count / received.length) * 100 : 0;
                  return (
                    <div key={score} className="flex items-center gap-3">
                      <span className="flex w-10 shrink-0 items-center gap-1 text-xs font-medium">
                        {score}
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                      </span>
                      <div className="flex-1">
                        <ProgressBar value={percent} tone="amber" />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums ss-subtle">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------ reviews received */}
      <Card className="mt-6">
        <CardHeader
          title="Reviews you have received"
          description="Public. These also appear on your profile."
          icon={<MessageSquareQuote className="h-4 w-4" aria-hidden="true" />}
        />
        <CardBody>
          {received.length === 0 ? (
            <EmptyState
              compact
              icon={<Star className="h-6 w-6" aria-hidden="true" />}
              title="No reviews yet"
              description="Complete an exchange and ask your partner for feedback — it helps both of you get better matches."
            />
          ) : (
            <ul className="space-y-4">
              {received.map((review) => (
                <li key={review.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link to={`/members/${review.author.username}`} className="flex items-center gap-2.5">
                      <Avatar
                        name={review.author.displayName}
                        src={review.author.avatarUrl}
                        seed={review.author.username}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium">{review.author.displayName}</p>
                        <p className="text-xs ss-subtle">{relativeTime(review.createdAt)}</p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-0.5" aria-label={`Rated ${review.rating} out of 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              'h-3.5 w-3.5',
                              i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-[rgb(var(--ss-border-strong))]',
                            )}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setReporting(review.id)}
                        aria-label="Report this review"
                        className="rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {review.comment ? <p className="mt-3 text-sm ss-muted">{review.comment}</p> : null}
                  {review.exchange ? (
                    <p className="mt-2">
                      <Badge variant="neutral">{review.exchange.title}</Badge>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* -------------------------------------------------------- review modal */}
      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title={reviewing ? `Review ${reviewing.displayName}` : 'Write a review'}
        description="Your review is public and permanently tied to this exchange. Be fair and specific."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={createReview.isPending}>
              Submit review
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <RatingInput label="Overall experience" value={rating} onChange={setRating} />
          <RatingInput label="Teaching quality" value={teachingRating} onChange={setTeachingRating} />
          <RatingInput label="Communication" value={communicationRating} onChange={setCommunicationRating} />
          <RatingInput label="Reliability" value={reliabilityRating} onChange={setReliabilityRating} />
          <TextAreaField
            label="Written feedback"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            showCount
            placeholder="What went well? What could have been better? What would you tell someone considering this exchange?"
          />
          <p className="rounded-lg border border-amber-500/35 bg-amber-50/60 px-3 py-2 text-xs dark:bg-amber-500/5">
            Reviews cannot be edited or deleted once submitted. Only the two of you can review this exchange,
            and only once each.
          </p>
        </div>
      </Modal>

      {/* -------------------------------------------------------- report modal */}
      <Modal
        open={Boolean(reporting)}
        onClose={() => setReporting(null)}
        title="Report this review"
        description="A moderator will look at it. Reports are anonymous to the review author."
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
                reportContent.mutate(
                  {
                    targetType: 'REVIEW',
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
              { value: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate language' },
              { value: 'HARASSMENT', label: 'Harassment' },
              { value: 'SPAM', label: 'Spam or advertising' },
              { value: 'FALSE_INFORMATION', label: 'Untrue or misleading' },
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

function RatingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <fieldset>
      <legend className="ss-label">{label}</legend>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${score} out of 5`}
            onClick={() => onChange(score)}
            className="rounded p-1 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                'h-6 w-6',
                score <= value ? 'fill-amber-400 text-amber-400' : 'text-[rgb(var(--ss-border-strong))]',
              )}
              aria-hidden="true"
            />
          </button>
        ))}
        <span className="ml-2 text-sm font-medium">{value}/5</span>
      </div>
    </fieldset>
  );
}
