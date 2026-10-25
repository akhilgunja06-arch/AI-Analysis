import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, Info, RotateCcw, Send, Sparkles, Target, X } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SelectField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, SkeletonGrid } from '@/components/ui/Feedback';
import { Reveal } from '@/components/animations/Motion';
import { MatchCard } from '@/components/widgets/ExchangeWidgets';
import { useDismissMatch, useMatches, useRestoreMatch } from '@/hooks/queries';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { formatNumber, pluralise } from '@/lib/utils';

/**
 * The API publishes the scoring weights, including the per-unit constants and
 * the ceiling each component can reach. The panel below shows the ceilings so
 * the numbers match the per-component totals on every card; the per-unit
 * constants are implementation detail and are not rendered.
 */
const CEILING_LABELS: { key: string; label: string }[] = [
  { key: 'teachToLearn', label: 'They teach what you want' },
  { key: 'learnToTeach', label: 'You teach what they want' },
  { key: 'languageCap', label: 'Shared language' },
  { key: 'timezoneMax', label: 'Timezone proximity' },
  { key: 'availabilityCap', label: 'Availability overlap' },
  { key: 'reputationMax', label: 'Reputation' },
];

/** Maps the published ceilings onto the MatchCard breakdown maxima. */
function breakdownMaxima(weights: Record<string, number> | undefined) {
  if (!weights) return undefined;
  return {
    skillTeachToLearn: weights.teachToLearn,
    skillLearnToTeach: weights.learnToTeach,
    language: weights.languageCap,
    timezone: weights.timezoneMax,
    availability: weights.availabilityCap,
    reputation: weights.reputationMax,
  };
}

/**
 * Matching engine page.
 *
 * The score breakdown is shown in full on every card. The page also states the
 * weights explicitly, because a recommendation nobody can explain is not worth
 * much.
 */
export default function MatchesPage() {
  const toast = useToast();
  const dismiss = useDismissMatch();
  const restore = useRestoreMatch();

  const [minScore, setMinScore] = useState(0);
  const [requireReciprocal, setRequireReciprocal] = useState(false);
  const [language, setLanguage] = useState('');
  const [maxTimezoneOffset, setMaxTimezoneOffset] = useState('');
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const filters = {
    limit: 40,
    minScore: minScore > 0 ? minScore : undefined,
    requireReciprocal: requireReciprocal || undefined,
    language: language || undefined,
    maxTimezoneOffset: maxTimezoneOffset ? Number(maxTimezoneOffset) : undefined,
    includeDismissed: includeDismissed || undefined,
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useMatches(filters);

  const matches = data?.data.matches ?? [];
  const criteria = data?.data.criteria;
  const maxima = breakdownMaxima(criteria?.weights);
  const dismissedCount = data?.data.dismissedCount ?? 0;

  const reset = () => {
    setMinScore(0);
    setRequireReciprocal(false);
    setLanguage('');
    setMaxTimezoneOffset('');
    setIncludeDismissed(false);
  };

  const hasSkills = (criteria?.yourSkillCounts.teaches ?? 0) > 0 && (criteria?.yourSkillCounts.wants ?? 0) > 0;

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Your matches</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Members who teach what you want to learn, ranked by a published formula. Open “Why this score?” on
            any card to see exactly how it was calculated.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/my-skills">
            <Button variant="secondary" leftIcon={<Target className="h-4 w-4" aria-hidden="true" />}>
              My skills
            </Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="match-filters"
            leftIcon={<Filter className="h-4 w-4" aria-hidden="true" />}
          >
            Filters
          </Button>
        </div>
      </div>

      {/* How matching works */}
      <Card className="mt-6 border-brand-500/25 bg-gradient-brand-soft">
        <CardBody className="flex flex-wrap items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
            <Info className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold">How the score is calculated</h2>
            <p className="mt-1.5 text-sm ss-muted">
              Matching is deterministic arithmetic — there is no machine-learning model involved. Each
              component below is computed from data on your profile and theirs, then added up.
            </p>
            {criteria ? (
              <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {CEILING_LABELS.filter(({ key }) => key in criteria.weights).map(({ key, label }) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="ss-muted">{label}</dt>
                    <dd className="font-semibold tabular-nums">
                      up to {criteria.weights[key]} points
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {criteria ? (
              <p className="mt-3 text-xs ss-subtle">
                Your lists: {criteria.yourSkillCounts.teaches}{' '}
                {pluralise(criteria.yourSkillCounts.teaches, 'skill')} to teach,{' '}
                {criteria.yourSkillCounts.wants} to learn.
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {showFilters ? (
        <Card id="match-filters" className="mt-4">
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Minimum score"
                value={String(minScore)}
                onChange={(event) => setMinScore(Number(event.target.value))}
                options={[0, 20, 40, 60, 80].map((value) => ({
                  value: String(value),
                  label: value === 0 ? 'Any score' : `${value} or above`,
                }))}
              />
              <TextField
                label="Shared language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="e.g. English"
                hint="Only show members who speak this."
              />
              <SelectField
                label="Timezone difference"
                value={maxTimezoneOffset}
                onChange={(event) => setMaxTimezoneOffset(event.target.value)}
                placeholder="Any difference"
                options={[1, 2, 4, 6, 12].map((hours) => ({
                  value: String(hours),
                  label: `Within ${hours} ${pluralise(hours, 'hour')}`,
                }))}
              />
              <div className="space-y-3 pt-6">
                <label className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={requireReciprocal}
                    onChange={(event) => setRequireReciprocal(event.target.checked)}
                  />
                  Only fully reciprocal matches
                </label>
                <label className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={includeDismissed}
                    onChange={(event) => setIncludeDismissed(event.target.checked)}
                  />
                  Include dismissed ({dismissedCount})
                </label>
              </div>
            </div>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={reset}
              leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
            >
              Reset filters
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {/* Results */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm ss-muted" aria-live="polite">
          {isLoading
            ? 'Scoring potential partners…'
            : `${formatNumber(matches.length)} ${matches.length === 1 ? 'match' : 'matches'}${isFetching && !isLoading ? ' · updating…' : ''}`}
        </p>
        {dismissedCount > 0 && !includeDismissed ? (
          <button
            type="button"
            onClick={() => setIncludeDismissed(true)}
            className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            {dismissedCount} dismissed {pluralise(dismissedCount, 'match')} hidden — show them
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} title="We could not load your matches" />
        ) : isLoading ? (
          <SkeletonGrid count={6} columns={3} />
        ) : !hasSkills ? (
          <EmptyState
            icon={<Target className="h-7 w-7" aria-hidden="true" />}
            title="Add skills to unlock matching"
            description="Matching needs at least one skill you can teach and one you want to learn. It takes a minute."
            action={
              <Link to="/my-skills">
                <Button leftIcon={<Target className="h-4 w-4" aria-hidden="true" />}>Add your skills</Button>
              </Link>
            }
            secondaryAction={
              <Link to="/explore">
                <Button variant="secondary">Browse skills instead</Button>
              </Link>
            }
          />
        ) : matches.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-7 w-7" aria-hidden="true" />}
            title="No matches with those filters"
            description={
              minScore > 60
                ? 'A high minimum score leaves very few matches on a small platform. Try lowering it.'
                : 'Try relaxing the filters, or add more skills so there is more to match against.'
            }
            action={
              <Button onClick={reset} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                Clear filters
              </Button>
            }
            secondaryAction={
              <Link to="/members">
                <Button variant="secondary">Browse all members</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {matches.map((match, index) => (
              <Reveal key={match.userId} delay={Math.min(index * 0.04, 0.3)}>
                <MatchCard
                  match={match}
                  maxima={maxima}
                  dismissing={dismiss.isPending}
                  onDismiss={
                    match.dismissed
                      ? undefined
                      : (userId) =>
                          dismiss.mutate(userId, {
                            onSuccess: () =>
                              toast.success('Dismissed', 'This recommendation is hidden. You can restore it from the filters panel.'),
                            onError: (err) =>
                              toast.error('Could not dismiss', err instanceof ApiError ? err.message : undefined),
                          })
                  }
                  actionSlot={
                    match.dismissed ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          restore.mutate(match.userId, {
                            onSuccess: () => toast.success('Restored', 'This recommendation is visible again.'),
                          })
                        }
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Link to={`/members/${match.username}`}>
                        <Button size="sm" leftIcon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}>
                          Propose exchange
                        </Button>
                      </Link>
                    )
                  }
                />
              </Reveal>
            ))}
          </div>
        )}
      </div>

      {!isLoading && matches.length > 0 ? (
        <Card className="mt-8">
          <CardHeader
            title="Not seeing anyone suitable?"
            description="Two things reliably improve your matches."
            icon={<X className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody className="space-y-3 text-sm ss-muted">
            <p>
              <strong className="text-[rgb(var(--ss-text))]">Be specific about what you want to learn.</strong>{' '}
              “React” matches far better than “programming”, because the engine compares exact skill entries.
            </p>
            <p>
              <strong className="text-[rgb(var(--ss-text))]">Keep availability current.</strong> Overlapping
              free time is worth points, so an empty availability list quietly costs you matches.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link to="/my-skills">
                <Button size="sm" variant="secondary">
                  Update my skills
                </Button>
              </Link>
              <Link to="/settings">
                <Button size="sm" variant="ghost">
                  Set availability
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </PageContainer>
  );
}

