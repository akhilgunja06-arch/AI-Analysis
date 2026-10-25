import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Globe,
  Image as ImageIcon,
  Languages,
  MapPin,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ProgressRing, ProgressBar } from '@/components/animations/Motion';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { SkillPicker } from '@/components/SkillPicker';
import { EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/providers/AuthProvider';
import { usePrefersReducedMotion } from '@/providers/ThemeProvider';
import {
  useAddSkill,
  useMySkills,
  useRemoveSkillEntry,
  useSaveAvailability,
} from '@/hooks/queries';
import { api, ApiError } from '@/lib/api';
import {
  COMMON_LANGUAGES,
  COMMON_TIMEZONES,
  cn,
  detectTimezone,
  pluralise,
  timeToMinutes,
  weekdayName,
} from '@/lib/utils';
import type { SkillLevel, SessionFormat } from '@/lib/types';

const STEPS = [
  { id: 1, title: 'Welcome', icon: Sparkles },
  { id: 2, title: 'About you', icon: UserRound },
  { id: 3, title: 'Skills you teach', icon: BookOpen },
  { id: 4, title: 'Skills you want to learn', icon: Sparkles },
  { id: 5, title: 'Availability', icon: Globe },
];

const LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner — I know the basics' },
  { value: 'INTERMEDIATE', label: 'Intermediate — I use it regularly' },
  { value: 'ADVANCED', label: 'Advanced — I can teach it deeply' },
  { value: 'EXPERT', label: 'Expert — I do this professionally' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { user, profile, completion, refresh, applyProfileUpdate } = useAuth();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Step 2 fields
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [headline, setHeadline] = useState(profile?.headline ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [timezone, setTimezone] = useState(profile?.timezone ?? detectTimezone());
  const [languages, setLanguages] = useState<string[]>(profile?.languages ?? ['English']);
  const [preferredFormat, setPreferredFormat] = useState<SessionFormat>(profile?.preferredFormat ?? 'ONLINE');
  const [learningGoals, setLearningGoals] = useState(profile?.learningGoals ?? '');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Step 3/4 pickers
  const [teachPick, setTeachPick] = useState<{ id: string; name: string } | null>(null);
  const [teachLevel, setTeachLevel] = useState<SkillLevel>('INTERMEDIATE');
  const [teachDescription, setTeachDescription] = useState('');
  const [learnPick, setLearnPick] = useState<{ id: string; name: string } | null>(null);
  const [learnLevel, setLearnLevel] = useState<SkillLevel>('BEGINNER');

  // Step 5 availability
  const [windows, setWindows] = useState<
    { weekday: number; start: string; end: string; format: SessionFormat }[]
  >([{ weekday: 1, start: '18:00', end: '20:00', format: 'ONLINE' }]);

  const { data: mySkills, isLoading: skillsLoading } = useMySkills();
  const addSkill = useAddSkill();
  const removeSkill = useRemoveSkillEntry();
  const saveAvailability = useSaveAvailability();

  const teaches = mySkills?.teaches ?? [];
  const wants = mySkills?.wants ?? [];

  // Keep the local form in step with the loaded profile once it arrives.
  useEffect(() => {
    if (!profile) return;
    setDisplayName((current) => current || profile.displayName);
    setTimezone((current) => current || profile.timezone);
    setLanguages((current) => (current.length > 0 ? current : profile.languages));
  }, [profile]);

  const percent = completion?.percent ?? 0;

  const canLeaveStep = useMemo(() => {
    if (step === 2) return displayName.trim().length >= 2;
    if (step === 3) return teaches.length > 0;
    if (step === 4) return wants.length > 0;
    return true;
  }, [step, displayName, teaches.length, wants.length]);

  const saveStep2 = async () => {
    if (displayName.trim().length < 2) {
      setFormError('Tell us what to call you before continuing.');
      return false;
    }
    setFormError(null);
    try {
      const res = await api.patch<{ profile: typeof profile; completion: typeof completion }>('/profile', {
        displayName: displayName.trim(),
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        timezone,
        languages,
        preferredFormat,
        learningGoals: learningGoals.trim() || null,
      });
      if (res.data.profile && res.data.completion) {
        applyProfileUpdate(res.data.profile, res.data.completion);
      }
      return true;
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'We could not save that.');
      return false;
    }
  };

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await api.upload<{ avatarUrl: string }>('/profile/avatar', formData);
      toast.success('Photo updated', 'Your new photo is now visible on your profile.');
      if (profile) {
        applyProfileUpdate({ ...profile, avatarUrl: res.data.avatarUrl }, completion ?? { percent: 0, missing: [] });
      }
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'That image could not be uploaded.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const addTeach = async () => {
    if (!teachPick) return;
    setFormError(null);
    try {
      await addSkill.mutateAsync({
        skillId: teachPick.id,
        direction: 'TEACH',
        level: teachLevel,
        description: teachDescription.trim() || undefined,
      });
      setTeachPick(null);
      setTeachDescription('');
      toast.success('Skill added', `You now teach ${teachPick.name}.`);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'We could not add that skill.');
    }
  };

  const addLearn = async () => {
    if (!learnPick) return;
    setFormError(null);
    try {
      await addSkill.mutateAsync({
        skillId: learnPick.id,
        direction: 'LEARN',
        level: learnLevel,
      });
      setLearnPick(null);
      toast.success('Goal added', `You are now learning ${learnPick.name}.`);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'We could not add that goal.');
    }
  };

  const persistAvailability = async () => {
    const cleaned = windows
      .map((window) => ({
        weekday: window.weekday,
        startMinute: timeToMinutes(window.start),
        endMinute: timeToMinutes(window.end),
        format: window.format,
      }))
      .filter((window) => window.endMinute > window.startMinute);

    if (cleaned.length === 0) {
      setFormError('Add at least one time window where the end is after the start.');
      return false;
    }
    setFormError(null);
    try {
      await saveAvailability.mutateAsync(cleaned);
      return true;
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'We could not save your availability.');
      return false;
    }
  };

  const finish = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const availabilitySaved = await persistAvailability();
      if (!availabilitySaved) {
        setSaving(false);
        return;
      }

      await api.patch('/profile/onboarding', { completed: true });
      await refresh();
      toast.success('You are all set', 'Your profile is complete and your matches are ready.');
      navigate('/matches', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setFormError(error.message);
      } else {
        setFormError(error instanceof ApiError ? error.message : 'We could not finish onboarding.');
      }
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === 2) {
      const saved = await saveStep2();
      if (!saved) return;
    }
    setStep((current) => Math.min(STEPS.length, current + 1));
  };

  const back = () => {
    setFormError(null);
    setStep((current) => Math.max(1, current - 1));
  };

  const toggleLanguage = (language: string) => {
    setLanguages((current) =>
      current.includes(language) ? current.filter((l) => l !== language) : [...current, language],
    );
  };

  return (
    <div className="min-h-screen bg-[rgb(var(--ss-bg))]">
      <header className="border-b bg-[rgb(var(--ss-bg-alt))]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo size={28} />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs ss-subtle sm:inline">
              Step {step} of {STEPS.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard')}
              title="You can finish this later from your profile"
            >
              Skip for now
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-3">
            <ol className="flex flex-1 items-center gap-2" aria-label="Onboarding steps">
              {STEPS.map((item, index) => {
                const isDone = step > item.id;
                const isCurrent = step === item.id;
                const Icon = item.icon;
                return (
                  <li key={item.id} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => (item.id < step ? setStep(item.id) : undefined)}
                      disabled={item.id > step}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                        item.id <= step ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isCurrent
                              ? 'bg-gradient-brand text-white shadow-glow-sm'
                              : 'bg-[rgb(var(--ss-border))] text-[rgb(var(--ss-text-muted))]',
                        )}
                      >
                        {isDone ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
                      </span>
                      <span className={cn('hidden text-xs font-medium sm:block', isCurrent && 'text-[rgb(var(--ss-text))]')}>
                        {item.title}
                      </span>
                    </button>
                    {index < STEPS.length - 1 ? (
                      <span
                        className={cn('h-px flex-1 transition-colors', isDone ? 'bg-emerald-500' : 'bg-[rgb(var(--ss-border))]')}
                        aria-hidden="true"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className="hidden shrink-0 sm:block">
              <ProgressRing value={percent} size={56} strokeWidth={5} label="Profile completion" />
            </div>
          </div>
          <ProgressBar value={percent} className="mt-4" label="Profile completion" showValue tone="brand" />
        </div>

        {formError ? (
          <div role="alert" className="mb-5 rounded-xl border border-rose-500/35 bg-rose-50/60 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300">
            {formError}
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* ------------------------------------------------ step 1 */}
            {step === 1 ? (
              <Card className="p-8 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-glow">
                  <Sparkles className="h-8 w-8" aria-hidden="true" />
                </span>
                <h1 className="mt-5 font-display text-2xl font-bold">
                  Welcome to SkillSpring{user ? `, ${user.username}` : ''}
                </h1>
                <p className="mx-auto mt-3 max-w-lg ss-muted">
                  Five short steps and your profile will be ready to match. Everything here can be changed
                  later, so do not overthink it.
                </p>

                <ul className="mx-auto mt-8 max-w-md space-y-3 text-left">
                  {[
                    'Add a photo and a short introduction so people know who they are dealing with.',
                    'List the skills you can teach, with an honest level for each.',
                    'List what you want to learn — this is what drives your matches.',
                    'Set the times you are usually free, in your own timezone.',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                      <span className="ss-muted">{line}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {/* ------------------------------------------------ step 2 */}
            {step === 2 ? (
              <Card className="p-6">
                <h2 className="font-display text-xl font-bold">About you</h2>
                <p className="mt-1 text-sm ss-muted">
                  This is what other members see. You control what is public in settings.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-5">
                  <Avatar
                    name={displayName || user?.username || 'Member'}
                    src={profile?.avatarUrl}
                    seed={user?.username}
                    size="2xl"
                  />
                  <div>
                    <label
                      htmlFor="avatar-upload"
                      className={cn('ss-btn-secondary cursor-pointer', avatarUploading && 'pointer-events-none opacity-60')}
                    >
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      {avatarUploading ? 'Uploading…' : 'Upload a photo'}
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadAvatar(file);
                        event.target.value = '';
                      }}
                    />
                    <p className="mt-2 text-xs ss-subtle">JPEG, PNG, WebP or GIF, up to 5 MB.</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <TextField
                    label="Display name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                    maxLength={80}
                    placeholder="Amara Okafor"
                  />
                  <TextField
                    label="Headline"
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    maxLength={120}
                    placeholder="Backend engineer learning product design"
                    hint="One line describing what you do and what you are after."
                  />
                </div>

                <TextAreaField
                  label="About you"
                  className="mt-5"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  maxLength={1000}
                  showCount
                  placeholder="What you work on, what you can teach well, and what you are hoping to learn."
                  hint="Two or three sentences is plenty. This is the first thing people read."
                />

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <TextField
                    label="Location"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    leftIcon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                    placeholder="City, country"
                    hint="Optional. You can hide it in settings."
                  />
                  <SelectField
                    label="Timezone"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    options={COMMON_TIMEZONES.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))}
                    hint="Used to interpret your availability and show session times."
                  />
                </div>

                <fieldset className="mt-5">
                  <legend className="ss-label">Languages you can hold a session in</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_LANGUAGES.map((language) => {
                      const selected = languages.includes(language);
                      return (
                        <button
                          key={language}
                          type="button"
                          onClick={() => toggleLanguage(language)}
                          aria-pressed={selected}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                            selected
                              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                              : 'hover:border-[rgb(var(--ss-ring))]',
                          )}
                        >
                          {language}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <SelectField
                    label="Preferred session format"
                    value={preferredFormat}
                    onChange={(event) => setPreferredFormat(event.target.value as SessionFormat)}
                    options={[
                      { value: 'ONLINE', label: 'Online' },
                      { value: 'IN_PERSON', label: 'In person' },
                      { value: 'EITHER', label: 'Either is fine' },
                    ]}
                  />
                  <TextAreaField
                    label="What are you hoping to get out of this?"
                    value={learningGoals}
                    onChange={(event) => setLearningGoals(event.target.value)}
                    maxLength={500}
                    showCount
                    placeholder="e.g. I want to design and ship my own dashboard without help."
                    hint="Optional, but it helps potential partners propose something concrete."
                  />
                </div>
              </Card>
            ) : null}

            {/* ------------------------------------------------ step 3 */}
            {step === 3 ? (
              <Card className="p-6">
                <h2 className="font-display text-xl font-bold">What can you teach?</h2>
                <p className="mt-1 text-sm ss-muted">
                  Add at least one. Be realistic about the level — people rely on it when choosing a partner.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <SkillPicker
                    label="Find a skill"
                    value={teachPick}
                    onChange={setTeachPick}
                    excludeIds={teaches.map((entry) => entry.skill.id)}
                  />
                  <SelectField
                    label="Your level"
                    value={teachLevel}
                    onChange={(event) => setTeachLevel(event.target.value as SkillLevel)}
                    options={LEVELS}
                  />
                </div>

                <TextAreaField
                  label="What would you cover?"
                  className="mt-4"
                  value={teachDescription}
                  onChange={(event) => setTeachDescription(event.target.value)}
                  maxLength={500}
                  showCount
                  placeholder="e.g. Python fundamentals, testing, and how to structure a FastAPI service."
                  hint="Optional. Concrete outcomes make a request much more likely to be accepted."
                />

                <Button
                  className="mt-4"
                  onClick={addTeach}
                  disabled={!teachPick}
                  loading={addSkill.isPending}
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  Add skill
                </Button>

                {teachLevel === 'EXPERT' ? (
                  <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-50/60 px-3 py-2 text-xs dark:bg-amber-500/5">
                    Expert-level entries need a link as evidence. Add one from the My Skills page after
                    onboarding.
                  </p>
                ) : null}

                <div className="mt-8">
                  <h3 className="text-sm font-semibold">
                    Skills you teach{' '}
                    <span className="font-normal ss-subtle">({teaches.length})</span>
                  </h3>
                  {skillsLoading ? (
                    <LoadingState label="Loading your skills" />
                  ) : teaches.length === 0 ? (
                    <EmptyState
                      compact
                      className="mt-3"
                      title="Nothing added yet"
                      description="Pick a skill above and set your level to add your first one."
                    />
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {teaches.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">{entry.skill.name}</span>
                              <Badge variant="brand">{entry.level.toLowerCase()}</Badge>
                              <span className="text-xs ss-subtle">{entry.skill.category.name}</span>
                            </div>
                            {entry.description ? (
                              <p className="mt-1 text-xs ss-muted">{entry.description}</p>
                            ) : null}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${entry.skill.name}`}
                            onClick={() => removeSkill.mutate(entry.id)}
                            leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            ) : null}

            {/* ------------------------------------------------ step 4 */}
            {step === 4 ? (
              <Card className="p-6">
                <h2 className="font-display text-xl font-bold">What do you want to learn?</h2>
                <p className="mt-1 text-sm ss-muted">
                  This drives your matches. Add at least one, and be specific — “React” finds better partners
                  than “programming”.
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <SkillPicker
                    label="Find a skill"
                    value={learnPick}
                    onChange={setLearnPick}
                    excludeIds={wants.map((entry) => entry.skill.id)}
                  />
                  <SelectField
                    label="Where you are now"
                    value={learnLevel}
                    onChange={(event) => setLearnLevel(event.target.value as SkillLevel)}
                    options={LEVELS}
                  />
                </div>

                <Button
                  className="mt-4"
                  onClick={addLearn}
                  disabled={!learnPick}
                  loading={addSkill.isPending}
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  Add learning goal
                </Button>

                <div className="mt-8">
                  <h3 className="text-sm font-semibold">
                    Skills you want to learn{' '}
                    <span className="font-normal ss-subtle">({wants.length})</span>
                  </h3>
                  {wants.length === 0 ? (
                    <EmptyState
                      compact
                      className="mt-3"
                      title="No learning goals yet"
                      description="Add what you want to learn so we can find someone who teaches it."
                    />
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {wants.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{entry.skill.name}</span>
                            <Badge variant="info">{entry.level.toLowerCase()}</Badge>
                            <span className="text-xs ss-subtle">{entry.skill.category.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${entry.skill.name}`}
                            onClick={() => removeSkill.mutate(entry.id)}
                            leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            ) : null}

            {/* ------------------------------------------------ step 5 */}
            {step === 5 ? (
              <Card className="p-6">
                <h2 className="font-display text-xl font-bold">When are you usually free?</h2>
                <p className="mt-1 text-sm ss-muted">
                  Availability is interpreted in {timezone.replace(/_/g, ' ')}. Overlapping free time with a
                  partner is worth points in matching.
                </p>

                <ul className="mt-6 space-y-3">
                  {windows.map((window, index) => (
                    <li key={index} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                      <SelectField
                        label="Day"
                        value={String(window.weekday)}
                        onChange={(event) =>
                          setWindows((current) =>
                            current.map((w, i) => (i === index ? { ...w, weekday: Number(event.target.value) } : w)),
                          )
                        }
                        options={[1, 2, 3, 4, 5, 6, 0].map((day) => ({ value: String(day), label: weekdayName(day) }))}
                      />
                      <TextField
                        label="From"
                        type="time"
                        value={window.start}
                        onChange={(event) =>
                          setWindows((current) =>
                            current.map((w, i) => (i === index ? { ...w, start: event.target.value } : w)),
                          )
                        }
                      />
                      <TextField
                        label="To"
                        type="time"
                        value={window.end}
                        onChange={(event) =>
                          setWindows((current) =>
                            current.map((w, i) => (i === index ? { ...w, end: event.target.value } : w)),
                          )
                        }
                        error={
                          timeToMinutes(window.end) <= timeToMinutes(window.start)
                            ? 'End must be after start.'
                            : undefined
                        }
                      />
                      <SelectField
                        label="Format"
                        value={window.format}
                        onChange={(event) =>
                          setWindows((current) =>
                            current.map((w, i) =>
                              i === index ? { ...w, format: event.target.value as SessionFormat } : w,
                            ),
                          )
                        }
                        options={[
                          { value: 'ONLINE', label: 'Online' },
                          { value: 'IN_PERSON', label: 'In person' },
                          { value: 'EITHER', label: 'Either' },
                        ]}
                      />
                      <div className="flex items-end">
                        <Button
                          variant="ghost"
                          aria-label={`Remove ${weekdayName(window.weekday)} window`}
                          onClick={() => setWindows((current) => current.filter((_, i) => i !== index))}
                          leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        >
                          <span className="sr-only sm:not-sr-only">Remove</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>

                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() =>
                    setWindows((current) => [...current, { weekday: 3, start: '18:00', end: '20:00', format: 'ONLINE' }])
                  }
                  leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                >
                  Add another window
                </Button>

                <div className="mt-6 rounded-xl border bg-[rgb(var(--ss-bg))] p-4">
                  <p className="text-sm font-semibold">Almost there</p>
                  <p className="mt-1 text-sm ss-muted">
                    Finishing onboarding marks your profile complete. You will land on your matches, where you
                    can send your first exchange request.
                  </p>
                  <p className="mt-2 text-xs ss-subtle">
                    {teaches.length} {pluralise(teaches.length, 'skill')} to teach · {wants.length}{' '}
                    {pluralise(wants.length, 'skill')} to learn · {windows.length}{' '}
                    {pluralise(windows.length, 'availability window')}
                  </p>
                </div>
              </Card>
            ) : null}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 1}
            leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
          >
            Back
          </Button>

          {step < STEPS.length ? (
            <Button
              onClick={next}
              disabled={!canLeaveStep}
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={finish}
              loading={saving}
              leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
            >
              Finish and see my matches
            </Button>
          )}
        </div>

        {!canLeaveStep && step >= 3 && step <= 4 ? (
          <p className="mt-3 text-center text-xs ss-subtle" role="status">
            {step === 3
              ? 'Add at least one skill you can teach to continue.'
              : 'Add at least one skill you want to learn to continue.'}
          </p>
        ) : null}

        <p className="mt-8 text-center text-xs ss-subtle">
          <Languages className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Session times are always shown in your own timezone, whichever timezone your partner is in.
        </p>
      </div>
    </div>
  );
}
