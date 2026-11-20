import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Info,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { MarkdownMessage } from '@/components/ai/MarkdownMessage';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, NotConfiguredState } from '@/components/ui/Feedback';
import {
  useLearningAgentStatus,
  useMutualMatches,
  useSkillAnalysis,
  useSkillChat,
  useSkillMentors,
  useStartConversation,
} from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { SkillAnalysisResponse, SkillChatTurn } from '@/lib/types';

const STAGE_LABEL: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

/**
 * The skill-learning agent.
 *
 * Flow: name a skill → a structured guide (validated server-side), real members
 * who know it, and resources that say where they came from. Then ask follow-up
 * questions in a chat scoped to that skill.
 *
 * Everything here is honest about its source. When the AI is not configured the
 * page says so instead of showing an empty roadmap; when resources came from a
 * curated list rather than a live search, each card is labelled unverified.
 */
export default function LearningAgentPage() {
  const navigate = useNavigate();
  const [skillInput, setSkillInput] = useState('');
  const [skill, setSkill] = useState('');
  const [language, setLanguage] = useState<'en' | 'te'>('en');
  const [analysis, setAnalysis] = useState<SkillAnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SkillChatTurn[]>([]);
  const [draft, setDraft] = useState('');

  const { data: status, isLoading: statusLoading } = useLearningAgentStatus();
  const analyse = useSkillAnalysis();
  const chat = useSkillChat();
  const startConversation = useStartConversation();
  const { data: mentorData } = useSkillMentors(skill);
  const { data: matchData } = useMutualMatches();

  const runAnalysis = (target: string) => {
    const cleaned = target.trim();
    if (cleaned.length < 2) return;
    setSkill(cleaned);
    setSkillInput(cleaned);
    setAnalysisError(null);
    setMessages([]);
    analyse.mutate(
      { skill: cleaned, language },
      {
        onSuccess: (response) => setAnalysis(response.data),
        onError: (err) => {
          setAnalysis(null);
          setAnalysisError(
            err instanceof ApiError ? err.message : 'The guide could not be generated. Please try again.',
          );
        },
      },
    );
  };

  const sendChat = () => {
    const text = draft.trim();
    if (!text || !skill || chat.isPending) return;
    const next: SkillChatTurn[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setDraft('');
    chat.mutate(
      { skill, language, messages: next },
      {
        onSuccess: (response) =>
          setMessages([...next, { role: 'assistant', content: response.data.reply }]),
        onError: (err) =>
          setMessages([
            ...next,
            {
              role: 'assistant',
              content:
                err instanceof ApiError
                  ? `I could not answer that: ${err.message}`
                  : 'Something went wrong while answering. Please try again.',
            },
          ]),
      },
    );
  };

  const openChat = async (username: string) => {
    const result = await startConversation.mutateAsync({ username });
    navigate(`/messages/${result.data.conversationId}`);
  };

  const aiReady = status?.ai.enabled ?? false;

  return (
    <PageContainer>
      <Breadcrumbs
        items={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Skill Learning Agent' }]}
      />

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Sparkles className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden />
            Skill Learning Agent
          </h1>
          <p className="mt-1 max-w-2xl text-sm ss-subtle">
            Name a skill and get a staged learning guide, real members who can help, and resources you
            can check. Then ask questions about it.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="ss-subtle">Language</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'en' | 'te')}
            className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="en">English</option>
            <option value="te">తెలుగు</option>
          </select>
        </label>
      </header>

      {/* Search */}
      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          runAnalysis(skillInput);
        }}
      >
        <label htmlFor="skill-input" className="sr-only">
          Skill to learn
        </label>
        <input
          id="skill-input"
          value={skillInput}
          onChange={(event) => setSkillInput(event.target.value)}
          placeholder="e.g. Python, public speaking, Figma, SQL"
          className="flex-1 rounded-lg border px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        <Button
          type="submit"
          loading={analyse.isPending}
          disabled={skillInput.trim().length < 2}
          leftIcon={<Sparkles className="h-4 w-4" />}
        >
          Build my guide
        </Button>
      </form>

      {/* Status honesty */}
      {!statusLoading && !aiReady && (
        <div className="mt-4">
          <NotConfiguredState
            title="The learning guide needs an AI provider"
            description={
              <>
                Set <code className="font-mono">AI_API_KEY</code> (and optionally{' '}
                <code className="font-mono">AI_MODEL</code>) in{' '}
                <code className="font-mono">server/.env</code>, then restart the API. Until then this
                page still shows real members who teach a skill, but it will not invent a roadmap.
              </>
            }
            integration="AI_API_KEY"
          />
        </div>
      )}

      {analysisError && (
        <Card className="mt-4 border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-sm text-rose-700 dark:text-rose-300">{analysisError}</p>
        </Card>
      )}

      {analyse.isPending && (
        <Card className="mt-4 flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
          <p className="text-sm ss-subtle">
            Building a staged guide for {skillInput || 'this skill'}…
          </p>
        </Card>
      )}

      {/* Guide */}
      {analysis && (
        <div className="mt-6 space-y-6">
          <Card className="p-5">
            <h2 className="text-xl font-semibold">{analysis.analysis.skill}</h2>
            <p className="mt-2 text-sm ss-subtle">{analysis.analysis.summary}</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide ss-subtle">
                  Why it is useful
                </h3>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {analysis.analysis.whyUseful.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide ss-subtle">
                  Before you start
                </h3>
                {analysis.analysis.prerequisites.length ? (
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {analysis.analysis.prerequisites.map((item) => (
                      <li key={item} className="flex gap-2">
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm ss-subtle">Nothing specific — you can start today.</p>
                )}
              </div>
            </div>

            {analysis.analysis.practiceTips.length > 0 && (
              <div className="mt-4 rounded-lg border bg-slate-50 p-3 dark:bg-slate-900/40">
                <h3 className="text-xs font-semibold uppercase tracking-wide ss-subtle">
                  Practice habits
                </h3>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {analysis.analysis.practiceTips.map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Stages */}
          {analysis.analysis.stages.map((stage) => (
            <Card key={stage.stage} className="p-5">
              <div className="flex items-center gap-2">
                <Badge variant={stage.stage === 'BEGINNER' ? 'info' : 'brand'}>
                  {STAGE_LABEL[stage.stage] ?? stage.stage}
                </Badge>
                <p className="text-sm ss-subtle">{stage.summary}</p>
              </div>

              <ol className="mt-4 space-y-4">
                {stage.topics.map((topic, index) => (
                  <li key={topic.title} className="border-l-2 border-brand-200 pl-4 dark:border-brand-900">
                    <p className="font-medium">
                      <span className="mr-2 text-xs ss-subtle">{index + 1}.</span>
                      {topic.title}
                    </p>
                    <p className="mt-1 text-sm ss-subtle">{topic.explanation}</p>
                    {topic.example && (
                      <p className="mt-1.5 rounded bg-slate-100 px-2 py-1.5 text-xs dark:bg-slate-800">
                        <span className="font-semibold">Example: </span>
                        {topic.example}
                      </p>
                    )}
                    {topic.exercise && (
                      <p className="mt-1.5 text-xs">
                        <span className="font-semibold">Practise: </span>
                        {topic.exercise}
                      </p>
                    )}
                  </li>
                ))}
              </ol>

              {stage.checklist.length > 0 && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <h4 className="text-xs font-semibold uppercase tracking-wide ss-subtle">
                    You are ready for the next stage when you can
                  </h4>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {stage.checklist.map((item) => (
                      <li key={item} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}

          {/* Projects */}
          {analysis.analysis.projects.length > 0 && (
            <Card className="p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Target className="h-4 w-4 text-brand-600" aria-hidden />
                Projects to build
              </h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {analysis.analysis.projects.map((project) => (
                  <li key={project.title} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{STAGE_LABEL[project.level] ?? project.level}</Badge>
                      <p className="text-sm font-medium">{project.title}</p>
                    </div>
                    <p className="mt-1 text-xs ss-subtle">{project.description}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Resources */}
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-brand-600" aria-hidden />
              Where to study
            </h3>

            {analysis.resourceNotice && (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {analysis.resourceNotice}
              </p>
            )}

            {analysis.resources.length === 0 ? (
              <p className="mt-2 text-sm ss-subtle">
                No verified resources are available for this skill yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {analysis.resources.map((resource) => (
                  <li key={resource.url} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 font-medium hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          {resource.title}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                        <p className="text-xs ss-subtle">
                          {resource.platform}
                          {resource.free === true && ' · free'}
                        </p>
                      </div>
                      <Badge variant={resource.verified ? 'brand' : 'neutral'}>
                        {resource.verified ? 'Checked' : 'Unverified'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs ss-subtle">{resource.description}</p>
                    <p className="mt-1 text-xs">{resource.whyUseful}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Mentors: real members */}
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-brand-600" aria-hidden />
              Members connected to {analysis.analysis.skill}
            </h3>
            <p className="mt-1 text-xs ss-subtle">
              Teachers are listed first. Everyone here has this skill on their profile and shares a
              public profile.
            </p>

            {mentorData?.mentors.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {mentorData.mentors.map((mentor) => (
                  <li key={mentor.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="relative shrink-0">
                      <Avatar name={mentor.displayName} src={mentor.avatarUrl} size="sm" />
                      {mentor.online && (
                        <span
                          aria-label="Online now"
                          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900"
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/members/${mentor.username}`}
                        className="block truncate text-sm font-medium hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        {mentor.displayName}
                      </Link>
                      <p className="truncate text-xs ss-subtle">
                        {mentor.direction === 'TEACH' ? 'Teaches' : 'Learning'} this · {mentor.level}
                        {mentor.place ? ` · ${mentor.place}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void openChat(mentor.username)}
                      disabled={startConversation.isPending}
                      aria-label={`Message ${mentor.username}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm ss-subtle">
                {mentorData?.notice ?? 'Nobody has listed this skill yet.'}
              </p>
            )}
          </Card>

          {/* Chat */}
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GraduationCap className="h-4 w-4 text-brand-600" aria-hidden />
              Ask about {analysis.analysis.skill}
            </h3>

            {messages.length === 0 && (
              <p className="mt-2 text-sm ss-subtle">
                Ask for an explanation, a worked example, a practice question, or a review of your work.
              </p>
            )}

            {messages.length > 0 && (
              <ul className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {messages.map((message, index) => (
                  <li
                    key={`${message.role}-${index}`}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      message.role === 'user'
                        ? 'ml-8 bg-brand-50 dark:bg-brand-950/40'
                        : 'mr-8 border bg-white dark:bg-slate-900',
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <MarkdownMessage content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </li>
                ))}
                {chat.isPending && (
                  <li className="mr-8 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ss-subtle">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Thinking…
                  </li>
                )}
              </ul>
            )}

            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                sendChat();
              }}
            >
              <label htmlFor="agent-chat" className="sr-only">
                Ask a question about {analysis.analysis.skill}
              </label>
              <input
                id="agent-chat"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  aiReady ? 'Ask anything about this skill…' : 'Add an AI key to enable chat'
                }
                disabled={!aiReady || chat.isPending}
                className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              />
              <Button
                type="submit"
                disabled={!aiReady || !draft.trim() || chat.isPending}
                leftIcon={<Send className="h-4 w-4" />}
              >
                Send
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* Mutual matches: available before choosing a skill */}
      {!analysis && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Your mutual exchange matches</h2>
          <p className="mt-1 text-sm ss-subtle">
            Members who teach what you want to learn and want to learn what you teach.
          </p>

          {matchData?.matches.length ? (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {matchData.matches.map((match) => (
                <li key={match.userId}>
                  <Card className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={match.displayName} src={match.avatarUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/members/${match.username}`}
                          className="block truncate font-medium hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          {match.displayName}
                        </Link>
                        <p className="truncate text-xs ss-subtle">
                          @{match.username}
                          {match.place ? ` · ${match.place}` : ''}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm ss-subtle">{match.why}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {match.theyTeach.map((skill) => (
                        <Badge key={`t-${skill.slug}`} variant="brand">
                          Teaches {skill.name}
                        </Badge>
                      ))}
                      {match.theyWant.map((skill) => (
                        <Badge key={`w-${skill.slug}`} variant="info">
                          Wants {skill.name}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-auto flex gap-2">
                      <Link
                        to={`/members/${match.username}`}
                        className="ss-btn ss-btn-secondary ss-btn-sm flex-1"
                      >
                        Profile
                      </Link>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => void openChat(match.username)}
                        disabled={startConversation.isPending}
                      >
                        Message
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-3"
              icon={<Users className="h-6 w-6" aria-hidden />}
              title="No mutual matches yet"
              description={
                matchData?.notice ??
                'Mutual matches appear when someone teaches what you want and wants what you teach.'
              }
              action={
                <Link to="/my-skills" className="ss-btn ss-btn-secondary">
                  Update my skills
                </Link>
              }
            />
          )}
        </section>
      )}
    </PageContainer>
  );
}
