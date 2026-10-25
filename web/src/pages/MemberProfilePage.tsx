import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  BookOpen,
  Calendar,
  ExternalLink,
  Flag,
  Github,
  Globe,
  GraduationCap,
  Linkedin,
  MapPin,
  MessageSquare,
  Send,
  Star,
  UserPlus,
  UserMinus,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, FormatBadge, SkillChip, VerifiedBadge } from '@/components/ui/Badge';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { SkillPicker } from '@/components/SkillPicker';
import { EmptyState, ErrorState, SkeletonText } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import {
  useBlockUser,
  useCreateExchangeRequest,
  useMemberProfile,
  useReportContent,
  useStartConversation,
  useToggleFollow,
  useUnblockUser,
} from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { formatDate, formatNumber, pluralise, relativeTime, weekdayName, minutesToTime } from '@/lib/utils';
import type { SessionFormat } from '@/lib/types';

export default function MemberProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, isAuthenticated } = useAuth();

  const { data: member, isLoading, isError, error, refetch } = useMemberProfile(username);
  const toggleFollow = useToggleFollow();
  const startConversation = useStartConversation();
  const createRequest = useCreateExchangeRequest();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const reportContent = useReportContent();

  const [requestOpen, setRequestOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  // Exchange request form
  const [offeredSkill, setOfferedSkill] = useState<{ id: string; name: string } | null>(null);
  const [requestedSkill, setRequestedSkill] = useState<{ id: string; name: string } | null>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [goals, setGoals] = useState('');
  const [sessionMinutes, setSessionMinutes] = useState('60');
  const [sessionsPerWeek, setSessionsPerWeek] = useState('1');
  const [totalSessions, setTotalSessions] = useState('6');
  const [preferredFormat, setPreferredFormat] = useState<SessionFormat>('ONLINE');

  // Message form
  const [messageBody, setMessageBody] = useState('');

  // Report form
  const [reportReason, setReportReason] = useState('SPAM');
  const [reportDetails, setReportDetails] = useState('');

  if (isLoading) {
    return (
      <PageContainer>
        <div className="ss-card p-8">
          <div className="flex items-start gap-5">
            <div className="ss-skeleton h-24 w-24 rounded-full" />
            <div className="flex-1 space-y-3">
              <div className="ss-skeleton h-7 w-1/3" />
              <div className="ss-skeleton h-4 w-1/4" />
              <SkeletonText lines={2} />
            </div>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (isError || !member) {
    const notFound = error instanceof ApiError && error.isNotFound;
    return (
      <PageContainer>
        {notFound ? (
          <EmptyState
            icon={<Users className="h-7 w-7" aria-hidden="true" />}
            title="We could not find that member"
            description="The username may be wrong, or the account may have been deleted."
            action={
              <Link to="/members">
                <Button>Browse members</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}
      </PageContainer>
    );
  }

  const isSelf = member.viewer.isSelf || user?.username === member.username;

  const sendRequest = async () => {
    try {
      await createRequest.mutateAsync({
        recipientId: member.id,
        offeredSkillId: offeredSkill?.id ?? null,
        requestedSkillId: requestedSkill?.id ?? null,
        message: requestMessage.trim() || undefined,
        goals: goals.trim() || undefined,
        sessionMinutes: Number(sessionMinutes),
        sessionsPerWeek: Number(sessionsPerWeek),
        totalSessions: Number(totalSessions),
        preferredFormat,
      });
      toast.success('Request sent', `${member.displayName} will see your proposal now.`);
      setRequestOpen(false);
      setRequestMessage('');
      setGoals('');
      navigate('/exchanges/requests');
    } catch (err) {
      toast.error(
        'Could not send the request',
        err instanceof ApiError ? err.message : 'Please try again.',
      );
    }
  };

  const sendMessage = async () => {
    if (messageBody.trim().length === 0) return;
    try {
      const res = await startConversation.mutateAsync({
        username: member.username,
        message: messageBody.trim(),
      });
      setMessageOpen(false);
      setMessageBody('');
      navigate(`/messages/${res.data.conversationId}`);
    } catch (err) {
      toast.error('Could not send the message', err instanceof ApiError ? err.message : undefined);
    }
  };

  const submitReport = async () => {
    try {
      await reportContent.mutateAsync({
        targetType: 'USER',
        targetId: member.id,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      toast.success('Report submitted', 'A moderator will review it.');
      setReportOpen(false);
      setReportDetails('');
    } catch (err) {
      toast.error('Could not submit the report', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <PageContainer>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm ss-muted transition-colors hover:text-[rgb(var(--ss-text))]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      {/* ------------------------------------------------------ header */}
      <Card className="overflow-hidden">
        <div className="h-28 bg-gradient-brand sm:h-36" aria-hidden="true" />
        <div className="px-5 pb-5 sm:px-8">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
            <div className="flex flex-wrap items-end gap-4">
              <Avatar
                name={member.displayName}
                src={member.avatarUrl}
                seed={member.username}
                size="2xl"
                ring
                className="ring-4"
              />
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-bold">{member.displayName}</h1>
                  <VerifiedBadge verified={member.emailVerified} />
                </div>
                <p className="text-sm ss-subtle">@{member.username}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pb-1">
              {isSelf ? (
                <Link to="/settings">
                  <Button variant="secondary">Edit profile</Button>
                </Link>
              ) : isAuthenticated ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      toggleFollow.mutate(
                        { username: member.username, follow: !member.viewer.isFollowing },
                        {
                          onSuccess: () =>
                            toast.success(
                              member.viewer.isFollowing ? 'Unfollowed' : 'Following',
                              member.viewer.isFollowing
                                ? `You will no longer see ${member.displayName} first.`
                                : `You will see ${member.displayName} first in your feeds.`,
                            ),
                        },
                      )
                    }
                    loading={toggleFollow.isPending}
                    leftIcon={
                      member.viewer.isFollowing ? (
                        <UserMinus className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                      )
                    }
                  >
                    {member.viewer.isFollowing ? 'Following' : 'Follow'}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!member.viewer.canMessage}
                    onClick={() => setMessageOpen(true)}
                    leftIcon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
                  >
                    Message
                  </Button>
                  <Button
                    onClick={() => {
                      setRequestedSkill(
                        member.teaches[0] ? { id: member.teaches[0].skillId, name: member.teaches[0].name } : null,
                      );
                      setRequestOpen(true);
                    }}
                    leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                  >
                    Request exchange
                  </Button>
                </>
              ) : (
                <Link to="/register">
                  <Button>Sign in to connect</Button>
                </Link>
              )}
            </div>
          </div>

          {member.headline ? <p className="mt-5 text-base ss-muted">{member.headline}</p> : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm ss-subtle">
            {member.location ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {member.location}
              </span>
            ) : null}
            {member.timezone ? (
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4" aria-hidden="true" />
                {member.timezone.replace(/_/g, ' ')}
              </span>
            ) : null}
            {member.languages.length > 0 ? (
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4" aria-hidden="true" />
                {member.languages.join(', ')}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Member since {formatDate(member.memberSince, { month: 'long', year: 'numeric' })}
            </span>
            <FormatBadge format={member.preferredFormat} />
          </div>

          {(member.websiteUrl || member.githubUrl || member.linkedinUrl) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {member.websiteUrl ? (
                <a
                  href={member.websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:border-[rgb(var(--ss-ring))]"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Website
                </a>
              ) : null}
              {member.githubUrl ? (
                <a
                  href={member.githubUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:border-[rgb(var(--ss-ring))]"
                >
                  <Github className="h-3.5 w-3.5" aria-hidden="true" />
                  GitHub
                </a>
              ) : null}
              {member.linkedinUrl ? (
                <a
                  href={member.linkedinUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:border-[rgb(var(--ss-ring))]"
                >
                  <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
                  LinkedIn
                </a>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------------- stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Completed exchanges"
          value={formatNumber(member.stats.completedExchanges)}
          icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
          tone="brand"
        />
        <StatCard
          label="Active exchanges"
          value={formatNumber(member.stats.activeExchanges)}
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          tone="emerald"
        />
        <StatCard
          label="Average rating"
          value={member.stats.averageRating !== null ? member.stats.averageRating.toFixed(2) : '—'}
          hint={
            member.stats.reviewsCount > 0
              ? `${member.stats.reviewsCount} ${pluralise(member.stats.reviewsCount, 'review')}`
              : 'No reviews yet'
          }
          icon={<Star className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
        />
        <StatCard
          label="Followers"
          value={formatNumber(member.stats.followers)}
          hint={`Following ${formatNumber(member.stats.following)}`}
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          tone="violet"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Bio */}
          <Card>
            <CardHeader title="About" icon={<BookOpen className="h-4 w-4" aria-hidden="true" />} />
            <CardBody>
              {member.bio ? (
                <p className="whitespace-pre-line text-sm leading-relaxed ss-muted">{member.bio}</p>
              ) : (
                <p className="text-sm ss-subtle">
                  {isSelf ? 'You have not written a bio yet.' : 'This member has not written a bio yet.'}
                </p>
              )}
            </CardBody>
          </Card>

          {/* Teaches */}
          <Card>
            <CardHeader
              title="Skills they can teach"
              description={`${member.teaches.length} ${pluralise(member.teaches.length, 'skill')} listed`}
              icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {member.teaches.length === 0 ? (
                <p className="text-sm ss-subtle">No teaching skills listed.</p>
              ) : (
                <ul className="space-y-3">
                  {member.teaches.map((skill) => (
                    <li key={skill.skillId} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{skill.name}</span>
                        <SkillChip name={skill.category} />
                        <Badge variant="brand">{skill.level.toLowerCase()}</Badge>
                      </div>
                      {skill.description ? (
                        <p className="mt-2 text-sm ss-muted">{skill.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Wants */}
          <Card>
            <CardHeader
              title="Skills they want to learn"
              description="Useful to know when proposing an exchange."
              icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {member.wants.length === 0 ? (
                <p className="text-sm ss-subtle">No learning goals listed.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {member.wants.map((skill) => (
                    <SkillChip key={skill.skillId} name={skill.name} level={skill.level} tone="learn" />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Portfolio */}
          {member.portfolio.length > 0 ? (
            <Card>
              <CardHeader
                title="Portfolio and evidence"
                description="Links the member attached to their skills."
                icon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <ul className="space-y-2">
                  {member.portfolio.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
                      <span className="text-sm font-medium">{item.skill}</span>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                        >
                          View
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-xs ss-subtle">No link provided</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {/* Reviews */}
          <Card>
            <CardHeader
              title="Reviews"
              description="Written by partners after completed exchanges. One review per partner per exchange."
              icon={<Star className="h-4 w-4" aria-hidden="true" />}
            />
            <CardBody>
              {member.reviews.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Star className="h-6 w-6" aria-hidden="true" />}
                  title="No reviews yet"
                  description="Reviews appear here once an exchange has been completed and feedback left."
                />
              ) : (
                <ul className="space-y-4">
                  {member.reviews.map((review) => (
                    <li key={review.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          to={`/members/${review.author.username}`}
                          className="flex items-center gap-2.5"
                        >
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
                        <div className="flex items-center gap-0.5" aria-label={`Rated ${review.rating} out of 5`}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={
                                i < review.rating
                                  ? 'h-3.5 w-3.5 fill-amber-400 text-amber-400'
                                  : 'h-3.5 w-3.5 text-[rgb(var(--ss-border-strong))]'
                              }
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                      </div>
                      {review.comment ? (
                        <p className="mt-3 text-sm ss-muted">{review.comment}</p>
                      ) : null}
                      {review.teachingRating || review.communicationRating || review.reliabilityRating ? (
                        <dl className="mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-xs">
                          {review.teachingRating ? (
                            <div>
                              <dt className="ss-subtle">Teaching</dt>
                              <dd className="font-semibold">{review.teachingRating}/5</dd>
                            </div>
                          ) : null}
                          {review.communicationRating ? (
                            <div>
                              <dt className="ss-subtle">Communication</dt>
                              <dd className="font-semibold">{review.communicationRating}/5</dd>
                            </div>
                          ) : null}
                          {review.reliabilityRating ? (
                            <div>
                              <dt className="ss-subtle">Reliability</dt>
                              <dd className="font-semibold">{review.reliabilityRating}/5</dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ---------------------------------------------------- sidebar */}
        <div className="space-y-6">
          {/* Availability */}
          {member.availability.length > 0 ? (
            <Card>
              <CardHeader
                title="Availability"
                description={member.timezone ? `Times in ${member.timezone.replace(/_/g, ' ')}` : undefined}
                icon={<Calendar className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <ul className="space-y-2">
                  {member.availability.map((window, index) => (
                    <li key={index} className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{weekdayName(window.weekday)}</span>
                      <span className="ss-muted">
                        {minutesToTime(window.startMinute)}–{minutesToTime(window.endMinute)}
                      </span>
                      <FormatBadge format={window.format} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {/* Actions for signed-in members */}
          {!isSelf && isAuthenticated ? (
            <Card>
              <CardHeader title="Safety" icon={<Flag className="h-4 w-4" aria-hidden="true" />} />
              <CardBody className="space-y-2">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setReportOpen(true)}
                  leftIcon={<Flag className="h-4 w-4" aria-hidden="true" />}
                >
                  Report this member
                </Button>
                {member.viewer.blockedByViewer ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() =>
                      unblockUser.mutate(member.username, {
                        onSuccess: () => toast.success('Unblocked', `You can interact with ${member.displayName} again.`),
                      })
                    }
                    leftIcon={<UserMinus className="h-4 w-4" aria-hidden="true" />}
                  >
                    Unblock
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    fullWidth
                    className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    onClick={() => setBlockOpen(true)}
                    leftIcon={<Ban className="h-4 w-4" aria-hidden="true" />}
                  >
                    Block
                  </Button>
                )}
              </CardBody>
            </Card>
          ) : null}

          {isSelf ? (
            <Card className="border-brand-500/30 bg-gradient-brand-soft">
              <CardBody>
                <p className="text-sm font-semibold">This is your public profile</p>
                <p className="mt-1.5 text-sm ss-muted">
                  This is exactly what other members see. Change what is visible in your privacy settings.
                </p>
                <Link to="/settings" className="mt-4 block">
                  <Button variant="secondary" fullWidth>
                    Privacy settings
                  </Button>
                </Link>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      {/* -------------------------------------------------- modals */}
      <Modal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title={`Propose an exchange with ${member.displayName}`}
        description="Be specific about what you will teach and what you want to learn. Proposals with clear goals are accepted far more often."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendRequest} loading={createRequest.isPending} leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}>
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <SkillPicker
            label="What will you teach them?"
            value={offeredSkill}
            onChange={setOfferedSkill}
            placeholder="Pick one of your teaching skills…"
          />

          <SkillPicker
            label="What do you want to learn from them?"
            value={requestedSkill}
            onChange={setRequestedSkill}
            placeholder="Pick one of their teaching skills…"
          />

          <TextAreaField
            label="Message"
            value={requestMessage}
            onChange={(event) => setRequestMessage(event.target.value)}
            maxLength={1000}
            showCount
            placeholder={`Hi ${member.displayName.split(' ')[0]}, I noticed we could help each other out…`}
            hint="A short, specific note works better than a template."
          />

          <TextAreaField
            label="What do you want to achieve?"
            value={goals}
            onChange={(event) => setGoals(event.target.value)}
            maxLength={500}
            showCount
            placeholder="e.g. Be able to build and deploy a small dashboard on my own."
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Session length"
              value={sessionMinutes}
              onChange={(event) => setSessionMinutes(event.target.value)}
              options={[30, 45, 60, 90, 120].map((minutes) => ({
                value: String(minutes),
                label: `${minutes} minutes`,
              }))}
            />
            <SelectField
              label="Sessions per week"
              value={sessionsPerWeek}
              onChange={(event) => setSessionsPerWeek(event.target.value)}
              options={[1, 2, 3].map((count) => ({ value: String(count), label: `${count} per week` }))}
            />
            <SelectField
              label="Total sessions"
              value={totalSessions}
              onChange={(event) => setTotalSessions(event.target.value)}
              options={[2, 4, 6, 8, 12].map((count) => ({ value: String(count), label: `${count} sessions` }))}
            />
            <SelectField
              label="Format"
              value={preferredFormat}
              onChange={(event) => setPreferredFormat(event.target.value as SessionFormat)}
              options={[
                { value: 'ONLINE', label: 'Online' },
                { value: 'IN_PERSON', label: 'In person' },
                { value: 'EITHER', label: 'Either' },
              ]}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title={`Message ${member.displayName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMessageOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={sendMessage}
              loading={startConversation.isPending}
              disabled={messageBody.trim().length === 0}
              leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            >
              Send
            </Button>
          </>
        }
      >
        <TextAreaField
          label="Your message"
          value={messageBody}
          onChange={(event) => setMessageBody(event.target.value)}
          maxLength={4000}
          showCount
          placeholder="Introduce yourself and say what you are hoping to learn or teach."
        />
      </Modal>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this member"
        description="Reports go to the moderation queue. You will not be identified to the member."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitReport} loading={reportContent.isPending}>
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
              { value: 'FAKE_PROFILE', label: 'Fake or misleading profile' },
              { value: 'NO_SHOW', label: 'Did not attend agreed sessions' },
              { value: 'OTHER', label: 'Something else' },
            ]}
          />
          <TextAreaField
            label="What happened?"
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            maxLength={2000}
            showCount
            placeholder="Include anything that would help a moderator understand the situation."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onConfirm={() => {
          blockUser.mutate(
            { username: member.username },
            {
              onSuccess: () => {
                toast.success('Blocked', `You and ${member.displayName} will no longer appear to each other.`);
                setBlockOpen(false);
                void refetch();
              },
            },
          );
        }}
        title={`Block ${member.displayName}?`}
        description={
          <ul className="space-y-2">
            <li>• You will be hidden from each other in discovery and matches.</li>
            <li>• Neither of you can send new messages or exchange requests.</li>
            <li>• Existing exchanges and their history are kept.</li>
            <li>• You can undo this at any time from this page.</li>
          </ul>
        }
        confirmLabel="Block member"
        destructive
        loading={blockUser.isPending}
      />

      {member.viewer.isBlocked ? (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-50/60 p-4 text-sm dark:bg-amber-500/5">
          <p className="font-medium">Interaction is restricted</p>
          <p className="mt-1 ss-muted">
            {member.viewer.blockedByViewer
              ? 'You have blocked this member, so messaging and exchange requests are disabled.'
              : 'This member has blocked you, so messaging and exchange requests are disabled.'}
          </p>
        </div>
      ) : null}
    </PageContainer>
  );
}
