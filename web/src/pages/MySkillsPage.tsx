import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, Plus, Sparkles, Target, Trash2 } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { SkillPicker } from '@/components/SkillPicker';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import {
  useAddSkill,
  useMySkills,
  useRemoveSkillEntry,
  useUpdateSkillEntry,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import type { SkillDirection, SkillLevel, UserSkillEntry } from '@/lib/types';

const LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner — I know the basics' },
  { value: 'INTERMEDIATE', label: 'Intermediate — I use it regularly' },
  { value: 'ADVANCED', label: 'Advanced — I can teach it deeply' },
  { value: 'EXPERT', label: 'Expert — I do this professionally' },
];

type Editing = { entry: UserSkillEntry } | null;

export default function MySkillsPage() {
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useMySkills();
  const addSkill = useAddSkill();
  const updateEntry = useUpdateSkillEntry();
  const removeEntry = useRemoveSkillEntry();

  const [direction, setDirection] = useState<SkillDirection>('TEACH');
  const [pick, setPick] = useState<{ id: string; name: string } | null>(null);
  const [level, setLevel] = useState<SkillLevel>('INTERMEDIATE');
  const [description, setDescription] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<UserSkillEntry | null>(null);

  const teaches = data?.teaches ?? [];
  const wants = data?.wants ?? [];

  const resetForm = () => {
    setPick(null);
    setDescription('');
    setOutcomes('');
    setPortfolioUrl('');
    setFormError(null);
  };

  const submit = async () => {
    if (!pick) {
      setFormError('Pick a skill first.');
      return;
    }
    setFormError(null);
    try {
      await addSkill.mutateAsync({
        skillId: pick.id,
        direction,
        level,
        description: description.trim() || undefined,
        outcomes: outcomes.trim() || undefined,
        portfolioUrl: portfolioUrl.trim() || undefined,
      });
      toast.success(
        direction === 'TEACH' ? 'Teaching skill added' : 'Learning goal added',
        `${pick.name} is now on your profile.`,
      );
      resetForm();
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        setFormError(`You already have ${pick.name} listed in that direction.`);
      } else if (err instanceof ApiError && err.isValidation) {
        setFormError(err.message);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'We could not add that skill.');
      }
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateEntry.mutateAsync({
        id: editing.entry.id,
        level: editing.entry.level,
        description: editing.entry.description,
        outcomes: editing.entry.outcomes,
        portfolioUrl: editing.entry.portfolioUrl,
        isActive: editing.entry.isActive,
      });
      toast.success('Saved', 'Your changes are live.');
      setEditing(null);
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : undefined);
    }
  };

  const renderList = (entries: UserSkillEntry[], kind: SkillDirection) => {
    if (entries.length === 0) {
      return (
        <EmptyState
          compact
          icon={kind === 'TEACH' ? <GraduationCap className="h-6 w-6" aria-hidden="true" /> : <Target className="h-6 w-6" aria-hidden="true" />}
          title={kind === 'TEACH' ? 'You have not listed any teaching skills' : 'No learning goals yet'}
          description={
            kind === 'TEACH'
              ? 'Add what you can teach. Partners use this to decide whether to propose an exchange.'
              : 'Add what you want to learn. This is what the matching engine uses to find partners.'
          }
          action={
            <Button
              size="sm"
              onClick={() => {
                setDirection(kind);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {kind === 'TEACH' ? 'Add a teaching skill' : 'Add a learning goal'}
            </Button>
          }
        />
      );
    }

    return (
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{entry.skill.name}</h3>
                  <Badge variant={kind === 'TEACH' ? 'brand' : 'info'}>{entry.level.toLowerCase()}</Badge>
                  <span className="text-xs ss-subtle">{entry.skill.category.name}</span>
                  {!entry.isActive ? <Badge variant="neutral">Hidden</Badge> : null}
                </div>
                {entry.description ? (
                  <p className="mt-2 text-sm ss-muted">{entry.description}</p>
                ) : null}
                {entry.outcomes ? (
                  <p className="mt-1.5 text-sm ss-muted">
                    <span className="font-medium">Outcomes: </span>
                    {entry.outcomes}
                  </p>
                ) : null}
                {entry.portfolioUrl ? (
                  <a
                    href={entry.portfolioUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-block break-all text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                  >
                    {entry.portfolioUrl}
                  </a>
                ) : null}
                {entry.yearsExperience ? (
                  <p className="mt-1.5 text-xs ss-subtle">{entry.yearsExperience} years of experience</p>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing({ entry })}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  onClick={() => setDeleting(entry)}
                  aria-label={`Remove ${entry.skill.name}`}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">My skills</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            What you teach decides who wants to work with you; what you want to learn decides who you get
            matched with. Keep both lists honest and specific.
          </p>
        </div>
        <Link to="/matches">
          <Button variant="secondary" leftIcon={<Sparkles className="h-4 w-4" aria-hidden="true" />}>
            See matches
          </Button>
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        {/* ------------------------------------------------------ add form */}
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader
            title="Add a skill"
            description="Search the taxonomy, then describe what you would cover."
            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
          />
          <CardBody className="space-y-4">
            <div>
              <span className="ss-label">Direction</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
                {(['TEACH', 'LEARN'] as SkillDirection[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={direction === value}
                    onClick={() => setDirection(value)}
                    className={
                      direction === value
                        ? 'rounded-xl border border-brand-500 bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors hover:border-[rgb(var(--ss-ring))]'
                    }
                  >
                    {value === 'TEACH' ? 'I can teach' : 'I want to learn'}
                  </button>
                ))}
              </div>
            </div>

            <SkillPicker
              value={pick}
              onChange={setPick}
              label="Skill"
              excludeIds={
                (direction === 'TEACH' ? teaches : wants).map((entry) => entry.skill.id)
              }
            />

            <SelectField
              label={direction === 'TEACH' ? 'Your level' : 'Where you are now'}
              value={level}
              onChange={(event) => setLevel(event.target.value as SkillLevel)}
              options={LEVELS}
            />

            {direction === 'TEACH' ? (
              <>
                <TextAreaField
                  label="What you would cover"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  showCount
                  placeholder="e.g. Python fundamentals, testing with pytest, and structuring a FastAPI service."
                  hint="Optional, but specific descriptions get more requests."
                />
                <TextAreaField
                  label="What a learner should be able to do afterwards"
                  value={outcomes}
                  onChange={(event) => setOutcomes(event.target.value)}
                  maxLength={500}
                  showCount
                  placeholder="e.g. Write and test a small API with a database."
                />
                <TextField
                  label="Evidence link"
                  type="url"
                  value={portfolioUrl}
                  onChange={(event) => setPortfolioUrl(event.target.value)}
                  placeholder="https://github.com/you/project"
                  hint="Required for expert level. A repository, portfolio or published work."
                />
              </>
            ) : null}

            {formError ? (
              <p role="alert" className="rounded-lg border border-rose-500/35 bg-rose-50/60 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300">
                {formError}
              </p>
            ) : null}

            <Button
              fullWidth
              onClick={submit}
              loading={addSkill.isPending}
              disabled={!pick}
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              {direction === 'TEACH' ? 'Add teaching skill' : 'Add learning goal'}
            </Button>
          </CardBody>
        </Card>

        {/* --------------------------------------------------------- lists */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Skills I can teach"
              description={`${teaches.length} listed. These appear on your public profile.`}
              icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {isLoading ? (
                <SkeletonRows count={3} />
              ) : isError ? (
                <ErrorState error={error} onRetry={() => void refetch()} compact />
              ) : (
                renderList(teaches, 'TEACH')
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Skills I want to learn"
              description={`${wants.length} listed. This drives your recommendations.`}
              icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {isLoading ? (
                <SkeletonRows count={3} />
              ) : isError ? (
                <ErrorState error={error} onRetry={() => void refetch()} compact />
              ) : (
                renderList(wants, 'LEARN')
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------- edit modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.entry.skill.name}` : 'Edit skill'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={updateEntry.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <SelectField
              label="Level"
              value={editing.entry.level}
              onChange={(event) =>
                setEditing({
                  entry: { ...editing.entry, level: event.target.value as SkillLevel },
                })
              }
              options={LEVELS}
            />
            <TextAreaField
              label="Description"
              value={editing.entry.description ?? ''}
              onChange={(event) =>
                setEditing({ entry: { ...editing.entry, description: event.target.value } })
              }
              maxLength={500}
              showCount
            />
            <TextAreaField
              label="Outcomes"
              value={editing.entry.outcomes ?? ''}
              onChange={(event) => setEditing({ entry: { ...editing.entry, outcomes: event.target.value } })}
              maxLength={500}
              showCount
            />
            <TextField
              label="Evidence link"
              type="url"
              value={editing.entry.portfolioUrl ?? ''}
              onChange={(event) =>
                setEditing({ entry: { ...editing.entry, portfolioUrl: event.target.value } })
              }
              hint="Required if the level is expert."
            />
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded"
                checked={editing.entry.isActive}
                onChange={(event) =>
                  setEditing({ entry: { ...editing.entry, isActive: event.target.checked } })
                }
              />
              <span className="text-sm">
                Visible on my profile
                <span className="mt-0.5 block text-xs ss-muted">
                  Hidden entries stay in your list but are not shown to others.
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          removeEntry.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Removed', `${deleting.skill.name} was removed from your list.`);
              setDeleting(null);
            },
            onError: (err) =>
              toast.error('Could not remove', err instanceof ApiError ? err.message : undefined),
          });
        }}
        title={deleting ? `Remove ${deleting.skill.name}?` : 'Remove skill?'}
        description="This removes the skill from your profile and from any future matching. Existing exchanges that reference it are not affected."
        confirmLabel="Remove"
        destructive
        loading={removeEntry.isPending}
      />
    </PageContainer>
  );
}
