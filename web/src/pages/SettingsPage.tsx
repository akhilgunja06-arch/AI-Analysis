import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Check,
  Download,
  Eye,
  Image as ImageIcon,
  KeyRound,
  Languages,
  Laptop,
  Link2,
  Lock,
  LogOut,
  MapPin,
  Monitor,
  Save,
  Shield,
  Trash2,
  UserRound,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField, ToggleField } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { ProgressRing } from '@/components/animations/Motion';
import {
  useAvailability,
  useIntegrationStatus,
  useRevokeSession,
  useSaveAvailability,
  useSettings,
  useUpdatePreferences,
  useUpdateProfile,
} from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { api, ApiError } from '@/lib/api';
import {
  COMMON_LANGUAGES,
  COMMON_TIMEZONES,
  cn,
  detectTimezone,
  formatDate,
  minutesToTime,
  pluralise,
  timeToMinutes,
  weekdayName,
} from '@/lib/utils';
import type { SessionFormat } from '@/lib/types';

type Tab = 'profile' | 'account' | 'privacy' | 'notifications' | 'availability' | 'sessions' | 'data';

const TABS: { value: Tab; label: string; icon: typeof UserRound }[] = [
  { value: 'profile', label: 'Profile', icon: UserRound },
  { value: 'account', label: 'Account', icon: Lock },
  { value: 'privacy', label: 'Privacy', icon: Eye },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  { value: 'availability', label: 'Availability', icon: Languages },
  { value: 'sessions', label: 'Sessions', icon: Laptop },
  { value: 'data', label: 'Your data', icon: Download },
];

export default function SettingsPage() {
  const toast = useToast();
  const { user, profile, completion, refresh, applyProfileUpdate } = useAuth();
  const { setTheme } = useTheme();

  const { data, isLoading, isError, error, refetch } = useSettings();
  const { data: windows } = useAvailability();
  const { data: integrations } = useIntegrationStatus();
  const updateProfile = useUpdateProfile();
  const updatePreferences = useUpdatePreferences();
  const saveAvailability = useSaveAvailability();
  const revokeSession = useRevokeSession();

  const [tab, setTab] = useState<Tab>('profile');

  // Profile form
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone());
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [preferredFormat, setPreferredFormat] = useState<SessionFormat>('ONLINE');
  const [learningGoals, setLearningGoals] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Account form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Availability
  const [localWindows, setLocalWindows] = useState<
    { weekday: number; start: string; end: string; format: SessionFormat }[]
  >([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [blockedListOpen, setBlockedListOpen] = useState(false);
  const [blocked, setBlocked] = useState<{ username: string; displayName: string }[]>([]);
  const loadedOnce = useRef(false);

  // Populate the profile form from the loaded settings once.
  useEffect(() => {
    if (!data?.profile || loadedOnce.current) return;
    loadedOnce.current = true;
    setDisplayName(data.profile.displayName);
    setHeadline(data.profile.headline ?? '');
    setBio(data.profile.bio ?? '');
    setLocation(data.profile.location ?? '');
    setTimezone(data.profile.timezone);
    setLanguages(data.profile.languages.length > 0 ? data.profile.languages : ['English']);
    setPreferredFormat(data.profile.preferredFormat);
    setLearningGoals(data.profile.learningGoals ?? '');
    setWebsiteUrl(data.profile.websiteUrl ?? '');
    setGithubUrl(data.profile.githubUrl ?? '');
    setLinkedinUrl(data.profile.linkedinUrl ?? '');
  }, [data]);

  useEffect(() => {
    if (!windows) return;
    setLocalWindows(
      windows.map((window) => ({
        weekday: window.weekday,
        start: minutesToTime(window.startMinute),
        end: minutesToTime(window.endMinute),
        format: window.format,
      })),
    );
  }, [windows]);

  const preferences = data?.preferences;

  const saveProfile = async () => {
    try {
      const res = await updateProfile.mutateAsync({
        displayName: displayName.trim(),
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        timezone,
        languages,
        preferredFormat,
        learningGoals: learningGoals.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        githubUrl: githubUrl.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
      });
      if (res.data.profile && res.data.completion) {
        applyProfileUpdate(res.data.profile as never, res.data.completion as never);
      }
      toast.success('Profile saved', 'Your public profile is up to date.');
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : undefined);
    }
  };

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await api.upload<{ avatarUrl: string }>('/profile/avatar', formData);
      toast.success('Photo updated');
      if (profile && completion) {
        applyProfileUpdate({ ...profile, avatarUrl: res.data.avatarUrl }, completion);
      }
    } catch (err) {
      toast.error('Could not upload that image', err instanceof ApiError ? err.message : undefined);
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      await api.delete('/profile/avatar');
      toast.success('Photo removed');
      await refresh();
    } catch (err) {
      toast.error('Could not remove the photo', err instanceof ApiError ? err.message : undefined);
    }
  };

  const changePassword = async () => {
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError('Use at least 10 characters.');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed', 'Every other device has been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      void refetch();
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'We could not change your password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const resendVerification = async () => {
    setResendingVerification(true);
    try {
      const res = await api.post<{ devVerificationToken?: string }>('/auth/resend-verification');
      toast.success('Verification email sent', 'Check your inbox.');
      if (res.data.devVerificationToken) {
        toast.info('Development mode', `Verification token: ${res.data.devVerificationToken}`);
      }
    } catch (err) {
      toast.error('Could not send the email', err instanceof ApiError ? err.message : undefined);
    } finally {
      setResendingVerification(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await api.get<Record<string, unknown>>('/settings/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `skillspring-data-${user?.username ?? 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded', 'Your data is in the JSON file.');
    } catch (err) {
      toast.error('Could not export your data', err instanceof ApiError ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const loadBlocked = async () => {
    setBlockedListOpen(true);
    try {
      const res = await api.get<{ username: string; displayName: string }[]>('/settings/blocked');
      setBlocked(res.data);
    } catch {
      setBlocked([]);
    }
  };

  const saveAvailabilityWindows = async () => {
    const cleaned = localWindows
      .map((window) => ({
        weekday: window.weekday,
        startMinute: timeToMinutes(window.start),
        endMinute: timeToMinutes(window.end),
        format: window.format,
      }))
      .filter((window) => window.endMinute > window.startMinute);

    if (localWindows.length > 0 && cleaned.length === 0) {
      toast.error('Check your windows', 'Every window needs an end time after its start time.');
      return;
    }

    try {
      await saveAvailability.mutateAsync(cleaned);
      toast.success('Availability saved', 'Matching uses this to find overlapping free time.');
    } catch (err) {
      toast.error('Could not save availability', err instanceof ApiError ? err.message : undefined);
    }
  };

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading your settings" />
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <ErrorState error={error} onRetry={() => void refetch()} title="We could not load your settings" />
      </PageContainer>
    );
  }

  const toggleLanguage = (language: string) =>
    setLanguages((current) =>
      current.includes(language) ? current.filter((item) => item !== language) : [...current, language],
    );

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Settings</h1>
          <p className="mt-2 ss-muted">
            Manage your profile, privacy, notifications and account. Changes to your profile apply
            immediately.
          </p>
        </div>
        <Link to={`/members/${user?.username}`}>
          <Button variant="secondary" leftIcon={<Eye className="h-4 w-4" aria-hidden="true" />}>
            View public profile
          </Button>
        </Link>
      </div>

      {/* Profile completion reminder */}
      {completion && completion.percent < 100 ? (
        <Card className="mt-6 border-amber-500/35 bg-amber-50/50 dark:bg-amber-500/5">
          <CardBody className="flex flex-wrap items-center gap-5">
            <ProgressRing value={completion.percent} size={72} strokeWidth={6} tone="amber" label="Profile completion" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Your profile is {completion.percent}% complete</p>
              <ul className="mt-2 space-y-1">
                {completion.missing.slice(0, 3).map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm ss-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Link to="/onboarding">
              <Button size="sm">Finish profile</Button>
            </Link>
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[15rem_1fr]">
        {/* Tab navigation */}
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.value} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => setTab(item.value)}
                    aria-current={tab === item.value ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                      tab === item.value
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'ss-muted hover:bg-[rgb(var(--ss-border)/0.5)]',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {/* ------------------------------------------------ profile tab */}
          {tab === 'profile' ? (
            <>
              <Card>
                <CardHeader
                  title="Profile photo"
                  description="Shown next to your name everywhere on the platform."
                  icon={<ImageIcon className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody className="flex flex-wrap items-center gap-5">
                  <Avatar
                    name={displayName || user?.username || 'Member'}
                    src={profile?.avatarUrl}
                    seed={user?.username}
                    size="2xl"
                  />
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="settings-avatar"
                        className={cn('ss-btn-secondary cursor-pointer', avatarUploading && 'pointer-events-none opacity-60')}
                      >
                        <ImageIcon className="h-4 w-4" aria-hidden="true" />
                        {avatarUploading ? 'Uploading…' : profile?.avatarUrl ? 'Replace photo' : 'Upload photo'}
                      </label>
                      <input
                        id="settings-avatar"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadAvatar(file);
                          event.target.value = '';
                        }}
                      />
                      {profile?.avatarUrl ? (
                        <Button variant="ghost" onClick={removeAvatar} leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs ss-subtle">
                      JPEG, PNG, WebP or GIF, up to 5 MB. Square images look best.
                    </p>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Public profile"
                  description="This is what other members see."
                  icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField
                      label="Display name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      maxLength={80}
                      required
                    />
                    <TextField
                      label="Username"
                      value={data.account.username}
                      disabled
                      hint="Usernames cannot be changed, so profile links stay stable."
                    />
                  </div>

                  <TextField
                    label="Headline"
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    maxLength={120}
                    placeholder="Backend engineer learning product design"
                  />

                  <TextAreaField
                    label="About you"
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    maxLength={1000}
                    showCount
                    placeholder="What you work on, what you can teach well, and what you want to learn."
                  />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField
                      label="Location"
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      leftIcon={<MapPin className="h-4 w-4" aria-hidden="true" />}
                      placeholder="City, country"
                      hint="You can hide this in privacy settings."
                    />
                    <SelectField
                      label="Timezone"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      options={COMMON_TIMEZONES.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))}
                    />
                  </div>

                  <fieldset>
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

                  <div className="grid gap-5 sm:grid-cols-2">
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
                      label="What you are hoping to learn"
                      value={learningGoals}
                      onChange={(event) => setLearningGoals(event.target.value)}
                      maxLength={500}
                      showCount
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-3">
                    <TextField
                      label="Website"
                      type="url"
                      value={websiteUrl}
                      onChange={(event) => setWebsiteUrl(event.target.value)}
                      placeholder="https://…"
                    />
                    <TextField
                      label="GitHub"
                      type="url"
                      value={githubUrl}
                      onChange={(event) => setGithubUrl(event.target.value)}
                      placeholder="https://github.com/…"
                    />
                    <TextField
                      label="LinkedIn"
                      type="url"
                      value={linkedinUrl}
                      onChange={(event) => setLinkedinUrl(event.target.value)}
                      placeholder="https://linkedin.com/in/…"
                    />
                  </div>

                  <Button
                    onClick={saveProfile}
                    loading={updateProfile.isPending}
                    leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
                  >
                    Save profile
                  </Button>
                </CardBody>
              </Card>
            </>
          ) : null}

          {/* ------------------------------------------------ account tab */}
          {tab === 'account' ? (
            <>
              <Card>
                <CardHeader
                  title="Account details"
                  description="Your email address is private and never shown publicly."
                  icon={<Lock className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                    <div className="min-w-0">
                      <p className="text-xs ss-subtle">Email address</p>
                      <p className="mt-0.5 break-all font-medium">{data.account.email}</p>
                    </div>
                    {data.account.emailVerified ? (
                      <Badge variant="success" icon={<Check className="h-3 w-3" aria-hidden="true" />}>
                        Verified
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="warning">Not verified</Badge>
                        <Button size="sm" variant="secondary" loading={resendingVerification} onClick={resendVerification}>
                          Resend email
                        </Button>
                      </div>
                    )}
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border p-3.5">
                      <dt className="text-xs ss-subtle">Username</dt>
                      <dd className="mt-0.5 font-medium">@{data.account.username}</dd>
                    </div>
                    <div className="rounded-xl border p-3.5">
                      <dt className="text-xs ss-subtle">Role</dt>
                      <dd className="mt-0.5 font-medium capitalize">{data.account.role.toLowerCase()}</dd>
                    </div>
                    <div className="rounded-xl border p-3.5">
                      <dt className="text-xs ss-subtle">Member since</dt>
                      <dd className="mt-0.5 font-medium">{formatDate(data.account.memberSince)}</dd>
                    </div>
                  </dl>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Change password"
                  description="Changing your password signs out every other device."
                  icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody className="space-y-4">
                  {passwordError ? (
                    <p role="alert" className="rounded-lg border border-rose-500/35 bg-rose-50/60 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300">
                      {passwordError}
                    </p>
                  ) : null}
                  <TextField
                    label="Current password"
                    reveal
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <TextField
                      label="New password"
                      reveal
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      hint="At least 10 characters with upper and lower case and a number."
                    />
                    <TextField
                      label="Confirm new password"
                      reveal
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </div>
                  <Button
                    onClick={changePassword}
                    loading={changingPassword}
                    disabled={!currentPassword || !newPassword}
                    leftIcon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
                  >
                    Change password
                  </Button>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Appearance"
                  description="Choose how SkillSpring looks on this device."
                  icon={<Monitor className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(['light', 'dark', 'system'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setTheme(option);
                          updatePreferences.mutate({ theme: option });
                        }}
                        aria-pressed={preferences?.theme === option}
                        className={cn(
                          'rounded-xl border px-4 py-3 text-sm font-medium capitalize transition-colors',
                          preferences?.theme === option
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                            : 'hover:border-[rgb(var(--ss-ring))]',
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 border-t pt-2">
                    <ToggleField
                      label="Reduce motion"
                      description="Turn off entrance animations, transitions and animated counters."
                      checked={preferences?.reducedMotion ?? false}
                      onChange={(next) => {
                        updatePreferences.mutate(
                          { reducedMotion: next },
                          { onSuccess: () => toast.success('Preference saved') },
                        );
                      }}
                    />
                  </div>
                </CardBody>
              </Card>

              {integrations && integrations.oauthProviders.length > 0 ? (
                <Card>
                  <CardHeader
                    title="Connected accounts"
                    description="Sign in with a provider instead of a password."
                    icon={<Link2 className="h-4 w-4" aria-hidden="true" />}
                  />
                  <CardBody>
                    <ul className="space-y-2">
                      {integrations.oauthProviders.map((provider) => (
                        <li key={provider} className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
                          <span className="text-sm font-medium capitalize">{provider}</span>
                          <Badge variant="neutral">Not connected</Badge>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}

              <Card className="border-rose-500/30">
                <CardHeader
                  title="Deactivate or delete"
                  description="These actions are permanent for deletion and reversible for deactivation."
                  icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                    <div>
                      <p className="text-sm font-medium">Deactivate my account</p>
                      <p className="mt-0.5 text-xs ss-muted">
                        Your profile is hidden and you cannot sign in. Reactivate any time by signing in again.
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => setDeactivateOpen(true)}>
                      Deactivate
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 p-4">
                    <div>
                      <p className="text-sm font-medium">Delete my account</p>
                      <p className="mt-0.5 text-xs ss-muted">
                        Removes your profile and personal data. Exchange history is anonymised, not destroyed.
                      </p>
                    </div>
                    <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                      Delete
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </>
          ) : null}

          {/* ------------------------------------------------ privacy tab */}
          {tab === 'privacy' && preferences ? (
            <Card>
              <CardHeader
                title="Privacy"
                description="Control what other members can see and who can contact you."
                icon={<Shield className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody className="divide-y">
                <ToggleField
                  label="Public profile"
                  description="When off, your profile is hidden from the member directory and search."
                  checked={preferences.publicProfile}
                  onChange={(next) => updatePreferences.mutate({ publicProfile: next })}
                />
                <ToggleField
                  label="Show my location"
                  description="Your city and country on your public profile."
                  checked={preferences.showLocation}
                  onChange={(next) => updatePreferences.mutate({ showLocation: next })}
                />
                <ToggleField
                  label="Show my languages"
                  description="Helps partners know which language to use for sessions."
                  checked={preferences.showLanguages}
                  onChange={(next) => updatePreferences.mutate({ showLanguages: next })}
                />
                <ToggleField
                  label="Show my availability"
                  description="Lets partners see when you are usually free."
                  checked={preferences.showAvailability}
                  onChange={(next) => updatePreferences.mutate({ showAvailability: next })}
                />
                <ToggleField
                  label="Show completed exchange count"
                  description="Your number of finished exchanges on your profile."
                  checked={preferences.showCompletedExchanges}
                  onChange={(next) => updatePreferences.mutate({ showCompletedExchanges: next })}
                />
                <ToggleField
                  label="Allow exchange requests"
                  description="When off, nobody can send you a new request."
                  checked={preferences.allowExchangeRequests}
                  onChange={(next) => updatePreferences.mutate({ allowExchangeRequests: next })}
                />

                <div className="py-4">
                  <SelectField
                    label="Who can message me"
                    value={preferences.allowMessagesFrom}
                    onChange={(event) => updatePreferences.mutate({ allowMessagesFrom: event.target.value })}
                    options={[
                      { value: 'MEMBERS', label: 'Any member' },
                      { value: 'FOLLOWING', label: 'Only people I follow' },
                      { value: 'NOBODY', label: 'Nobody' },
                    ]}
                    hint="Existing conversations are unaffected."
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-sm font-medium">Blocked members</p>
                    <p className="mt-0.5 text-xs ss-muted">
                      {data.blockedCount === 0
                        ? 'You have not blocked anyone.'
                        : `${data.blockedCount} ${pluralise(data.blockedCount, 'member')} blocked.`}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={loadBlocked} disabled={data.blockedCount === 0}>
                    Manage blocked
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* -------------------------------------------- notifications tab */}
          {tab === 'notifications' && preferences ? (
            <>
              <Card>
                <CardHeader
                  title="Email notifications"
                  description={
                    integrations?.emailDelivery.enabled
                      ? `Delivered through ${integrations.emailDelivery.provider}.`
                      : 'Email delivery is not configured on this deployment, so these are saved but no email is sent.'
                  }
                  icon={<Bell className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody className="divide-y">
                  {!integrations?.emailDelivery.enabled ? (
                    <p className="pb-4 text-xs ss-subtle">
                      Preferences below are stored and will take effect if an operator configures a mail
                      provider. In-app notifications work regardless.
                    </p>
                  ) : null}
                  <ToggleField
                    label="Exchange requests and updates"
                    description="When someone proposes, accepts, declines or counters an exchange."
                    checked={preferences.emailOnExchange}
                    onChange={(next) => updatePreferences.mutate({ emailOnExchange: next })}
                  />
                  <ToggleField
                    label="Direct messages"
                    description="When you receive a message and are not signed in."
                    checked={preferences.emailOnMessage}
                    onChange={(next) => updatePreferences.mutate({ emailOnMessage: next })}
                  />
                  <ToggleField
                    label="Session changes and reminders"
                    description="Scheduled, rescheduled, cancelled and upcoming sessions."
                    checked={preferences.emailOnSession}
                    onChange={(next) => updatePreferences.mutate({ emailOnSession: next })}
                  />
                  <ToggleField
                    label="Reviews"
                    description="When a partner leaves you a review, or one is waiting for you."
                    checked={preferences.emailOnReview}
                    onChange={(next) => updatePreferences.mutate({ emailOnReview: next })}
                  />
                  <ToggleField
                    label="Community replies"
                    description="When someone answers your question or replies to your post."
                    checked={preferences.emailOnCommunity}
                    onChange={(next) => updatePreferences.mutate({ emailOnCommunity: next })}
                  />
                  <ToggleField
                    label="Weekly digest"
                    description="A Monday summary of your exchanges, sessions and matches."
                    checked={preferences.weeklyDigest}
                    onChange={(next) => updatePreferences.mutate({ weeklyDigest: next })}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="In-app notifications"
                  description="The bell menu in the header."
                  icon={<Bell className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody>
                  <ToggleField
                    label="Everything in the bell menu"
                    description="Turn off to keep the bell quiet; the notifications page still keeps a record."
                    checked={preferences.inAppOnEverything}
                    onChange={(next) => updatePreferences.mutate({ inAppOnEverything: next })}
                  />
                </CardBody>
              </Card>
            </>
          ) : null}

          {/* -------------------------------------------- availability tab */}
          {tab === 'availability' ? (
            <Card>
              <CardHeader
                title="Weekly availability"
                description={`Interpreted in ${timezone.replace(/_/g, ' ')}. Overlapping free time with a partner is worth points in matching.`}
                icon={<Languages className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody className="space-y-4">
                {localWindows.length === 0 ? (
                  <EmptyState
                    compact
                    title="No availability set"
                    description="Add the windows when you are usually free. It noticeably improves your matches."
                    action={
                      <Button
                        size="sm"
                        onClick={() =>
                          setLocalWindows([{ weekday: 1, start: '18:00', end: '20:00', format: 'ONLINE' }])
                        }
                      >
                        Add a window
                      </Button>
                    }
                  />
                ) : (
                  <ul className="space-y-3">
                    {localWindows.map((window, index) => (
                      <li
                        key={index}
                        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"
                      >
                        <SelectField
                          label="Day"
                          value={String(window.weekday)}
                          onChange={(event) =>
                            setLocalWindows((current) =>
                              current.map((item, i) =>
                                i === index ? { ...item, weekday: Number(event.target.value) } : item,
                              ),
                            )
                          }
                          options={[1, 2, 3, 4, 5, 6, 0].map((day) => ({
                            value: String(day),
                            label: weekdayName(day),
                          }))}
                        />
                        <TextField
                          label="From"
                          type="time"
                          value={window.start}
                          onChange={(event) =>
                            setLocalWindows((current) =>
                              current.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)),
                            )
                          }
                        />
                        <TextField
                          label="To"
                          type="time"
                          value={window.end}
                          onChange={(event) =>
                            setLocalWindows((current) =>
                              current.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)),
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
                            setLocalWindows((current) =>
                              current.map((item, i) =>
                                i === index ? { ...item, format: event.target.value as SessionFormat } : item,
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
                            onClick={() => setLocalWindows((current) => current.filter((_, i) => i !== index))}
                            leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                          >
                            <span className="sr-only sm:not-sr-only">Remove</span>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setLocalWindows((current) => [
                        ...current,
                        { weekday: 3, start: '18:00', end: '20:00', format: 'ONLINE' },
                      ])
                    }
                    leftIcon={<Languages className="h-4 w-4" aria-hidden="true" />}
                  >
                    Add window
                  </Button>
                  <Button onClick={saveAvailabilityWindows} loading={saveAvailability.isPending}>
                    Save availability
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* ------------------------------------------------ sessions tab */}
          {tab === 'sessions' ? (
            <Card>
              <CardHeader
                title="Active sessions"
                description="Every device with a signed-in session. Revoke anything you do not recognise."
                icon={<Laptop className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                {data.sessions.length === 0 ? (
                  <p className="text-sm ss-subtle">No active sessions found.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.sessions.map((session) => (
                      <li
                        key={session.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">
                              {session.current ? 'This device' : describeDevice(session.userAgent)}
                            </p>
                            {session.current ? <Badge variant="success">Current</Badge> : null}
                          </div>
                          <p className="mt-0.5 break-all text-xs ss-subtle">
                            {session.userAgent ? session.userAgent.slice(0, 90) : 'Unknown device'}
                            {session.userAgent && session.userAgent.length > 90 ? '…' : ''}
                          </p>
                          <p className="mt-0.5 text-xs ss-subtle">
                            Last used {formatDate(session.lastUsedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </div>
                        {session.current ? (
                          <Button
                            variant="ghost"
                            onClick={async () => {
                              await api.post('/auth/logout');
                              window.location.href = '/login';
                            }}
                            leftIcon={<LogOut className="h-4 w-4" aria-hidden="true" />}
                          >
                            Sign out
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                            loading={revoking === session.id}
                            onClick={() => setRevoking(session.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : null}

          {/* ---------------------------------------------------- data tab */}
          {tab === 'data' ? (
            <>
              <Card>
                <CardHeader
                  title="Export your data"
                  description="Everything we hold about you, as a JSON file."
                  icon={<Download className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody className="space-y-4">
                  <p className="text-sm ss-muted">
                    The export includes your profile, skills, availability, exchanges, sessions, notes,
                    messages you sent, reviews, community posts and preferences. Passwords and session tokens
                    are never included.
                  </p>
                  <Button
                    onClick={exportData}
                    loading={exporting}
                    leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
                  >
                    Download my data
                  </Button>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="What we store and why"
                  description="A plain-language summary. The full detail is in the privacy policy."
                  icon={<Shield className="h-4 w-4" aria-hidden="true" />}
                />
                <CardBody>
                  <dl className="space-y-4 text-sm">
                    {[
                      {
                        term: 'Account and profile',
                        detail:
                          'Your email, username, password hash, display name, biography, location, timezone and languages — needed to run your account and show your public profile.',
                      },
                      {
                        term: 'Skills and availability',
                        detail:
                          'What you teach and want to learn, plus your weekly free time. Used for matching and discovery.',
                      },
                      {
                        term: 'Exchanges, sessions and notes',
                        detail:
                          'The record of what you agreed and did together. Both participants can read the shared notes.',
                      },
                      {
                        term: 'Messages',
                        detail:
                          'Only visible to the people in a conversation. Moderators can see reported content after a report is filed.',
                      },
                      {
                        term: 'Sessions and audit records',
                        detail:
                          'Sign-in records and administrative actions, kept so you can review access and so moderation is accountable.',
                      },
                    ].map((item) => (
                      <div key={item.term}>
                        <dt className="font-medium">{item.term}</dt>
                        <dd className="mt-0.5 ss-muted">{item.detail}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link to="/privacy">
                      <Button variant="secondary" size="sm">
                        Read the privacy policy
                      </Button>
                    </Link>
                    <Link to="/help#contact">
                      <Button variant="ghost" size="sm">
                        Contact us
                      </Button>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            </>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------- dialogs */}
      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (!revoking) return;
          revokeSession.mutate(revoking, {
            onSuccess: () => {
              toast.success('Session revoked', 'That device has been signed out.');
              setRevoking(null);
            },
            onError: (err) => toast.error('Could not revoke', err instanceof ApiError ? err.message : undefined),
          });
        }}
        title="Revoke this session?"
        description="That device will be signed out immediately and will need to sign in again."
        confirmLabel="Revoke session"
        destructive
        loading={revokeSession.isPending}
      />

      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={async () => {
          try {
            await api.post('/settings/deactivate');
            toast.success('Account deactivated', 'Sign in again any time to reactivate it.');
            window.location.href = '/';
          } catch (err) {
            toast.error('Could not deactivate', err instanceof ApiError ? err.message : undefined);
          }
        }}
        title="Deactivate your account?"
        description={
          <ul className="space-y-2">
            <li>• Your profile is hidden from the directory, search and matching.</li>
            <li>• Active exchanges are paused; your partners are notified.</li>
            <li>• You are signed out everywhere.</li>
            <li>• Signing in again reactivates the account.</li>
          </ul>
        }
        confirmLabel="Deactivate account"
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await api.delete('/settings/account');
            toast.success('Account deleted', 'Your personal data has been removed.');
            window.location.href = '/';
          } catch (err) {
            toast.error('Could not delete the account', err instanceof ApiError ? err.message : undefined);
          }
        }}
        title="Delete your account permanently?"
        description={
          <>
            <p className="mb-2">
              This cannot be undone. Your profile, skills, availability, messages and preferences are
              deleted.
            </p>
            <ul className="space-y-2">
              <li>• Completed exchanges are kept but anonymised, so your partners keep their learning history.</li>
              <li>• Reviews you wrote stay, attributed to a deleted member.</li>
              <li>• Any active exchange is cancelled.</li>
            </ul>
          </>
        }
        confirmLabel="Delete my account"
        destructive
        requireText={user?.username}
      />

      <Modal
        open={blockedListOpen}
        onClose={() => setBlockedListOpen(false)}
        title="Blocked members"
        description="Blocked members cannot message you, send requests or see your profile."
      >
        {blocked.length === 0 ? (
          <p className="text-sm ss-subtle">No blocked members.</p>
        ) : (
          <ul className="space-y-2">
            {blocked.map((item) => (
              <li key={item.username} className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
                <Link to={`/members/${item.username}`} className="flex items-center gap-2.5">
                  <Avatar name={item.displayName} seed={item.username} size="sm" />
                  <span className="text-sm font-medium">{item.displayName}</span>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await api.delete(`/messages/users/${item.username}/block`);
                    setBlocked((current) => current.filter((entry) => entry.username !== item.username));
                    toast.success('Unblocked', `${item.displayName} can interact with you again.`);
                    void refetch();
                  }}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </PageContainer>
  );
}

/** Best-effort human label from a user-agent string. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Firefox/i.test(userAgent)
    ? 'Firefox'
    : /Edg/i.test(userAgent)
      ? 'Edge'
      : /Chrome/i.test(userAgent)
        ? 'Chrome'
        : /Safari/i.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const platform = /Windows/i.test(userAgent)
    ? 'Windows'
    : /Macintosh|Mac OS/i.test(userAgent)
      ? 'macOS'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/i.test(userAgent)
          ? 'iOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'unknown platform';
  return `${browser} on ${platform}`;
}
