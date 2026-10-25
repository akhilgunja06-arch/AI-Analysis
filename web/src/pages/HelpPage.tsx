import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  LifeBuoy,
  Mail,
  Search,
  Send,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useFaq, useIntegrationStatus, useSubmitSupportTicket } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { id: 'how-it-works', label: 'How exchanges work' },
  { id: 'matching', label: 'Matching and scores' },
  { id: 'account', label: 'Account and profile' },
  { id: 'safety', label: 'Safety and reporting' },
  { id: 'limitations', label: 'Platform limitations' },
  { id: 'contact', label: 'Contact us' },
];

export default function HelpPage() {
  const toast = useToast();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const { data, isLoading, isError, error, refetch } = useFaq(debounced);
  const { data: integrations } = useIntegrationStatus();
  const submitTicket = useSubmitSupportTicket();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('TECHNICAL');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const activeSection = location.hash.replace('#', '');

  const send = async () => {
    setFormError(null);
    if (name.trim().length < 2) {
      setFormError('Tell us your name so we can reply properly.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFormError('That email address does not look right.');
      return;
    }
    if (message.trim().length < 20) {
      setFormError('Please give us at least 20 characters of detail so we can help.');
      return;
    }
    try {
      const res = await submitTicket.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        subject,
        message: message.trim(),
      });
      setReference(res.data.reference);
      setMessage('');
      toast.success('Message sent', `Your reference is ${res.data.reference}.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'We could not send that message.');
    }
  };

  return (
    <PageContainer>
      {/* Header */}
      <div className="ss-hero-bg -mx-4 rounded-3xl border px-6 py-12 sm:mx-0 sm:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/12 dark:text-brand-300">
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
            Help centre
          </span>
          <h1 className="ss-heading-page mt-4">How can we help?</h1>
          <p className="mt-3 ss-muted">
            Answers to the questions we are asked most, plus how to reach a human.
          </p>

          <div className="relative mx-auto mt-6 max-w-lg">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
            <input
              type="search"
              className="ss-input pl-10"
              placeholder="Search the help centre…"
              value={search}
              aria-label="Search help articles"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Section jump links */}
      <nav aria-label="Help sections" className="mt-6 flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-[rgb(var(--ss-ring))]',
              activeSection === section.id && 'border-brand-500 bg-brand-50 dark:bg-brand-500/15',
            )}
          >
            {section.label}
          </a>
        ))}
      </nav>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* ------------------------------------------------------- FAQ */}
        <div className="space-y-6">
          <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="How exchanges work"
                description="The end-to-end flow, in order."
                icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <ol className="space-y-4">
                  {[
                    {
                      title: 'Create and verify your account',
                      body: 'Register with an email address and password. Verifying your email unlocks requests, messaging and community posting.',
                    },
                    {
                      title: 'Add skills in both directions',
                      body: 'List what you can teach with an honest level, and what you want to learn. Both lists are needed for matching.',
                    },
                    {
                      title: 'Find a complementary partner',
                      body: 'Your matches list people who teach what you want to learn and want to learn what you teach, with the score broken down.',
                    },
                    {
                      title: 'Send a proposal',
                      body: 'Pick the skills, say what you want to achieve, and propose a session length, frequency and total number of sessions.',
                    },
                    {
                      title: 'Agree the terms',
                      body: 'The other member can accept, decline, or counter-propose different terms. Only when both agree does an exchange become active.',
                    },
                    {
                      title: 'Meet and record progress',
                      body: 'Schedule sessions, tick off milestones and keep shared notes. Both of you see the same record.',
                    },
                    {
                      title: 'Confirm completion and review',
                      body: 'When the agreed goals are met, you both confirm. Then you can each leave one review for the other.',
                    },
                  ].map((step, index) => (
                    <li key={step.title} className="flex gap-3.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{step.title}</p>
                        <p className="mt-0.5 text-sm ss-muted">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          </section>

          <section id="matching" aria-labelledby="matching-heading" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="Matching and scores"
                description="How a match score is produced, and what it does not do."
                icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody className="space-y-3 text-sm ss-muted">
                <p>
                  Matching is plain arithmetic, not machine learning. For each other member we compare your
                  teaching list against their learning list and vice versa, then add points for shared
                  languages, a workable timezone difference, overlapping availability and review history.
                </p>
                <p>
                  Every card shows its own breakdown under “Why this score?”, so you can check the arithmetic
                  yourself. If a component looks wrong, it is usually because a profile field is empty — an
                  unfilled availability list quietly costs you points.
                </p>
                <p>
                  We never claim an AI model is used for matching, because it is not. Optional AI assistance
                  can be enabled by an operator for drafting profile text; the settings page tells you whether
                  that is configured on this deployment.
                </p>
              </CardBody>
            </Card>
          </section>

          <section id="account" aria-labelledby="account-heading" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="Account and profile"
                icon={<Users className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody className="space-y-4">
                <p className="text-sm ss-muted">
                  Frequently asked questions from the knowledge base. Use the search box above to filter these.
                </p>

                {isLoading ? (
                  <LoadingState label="Loading articles" />
                ) : isError ? (
                  <ErrorState error={error} onRetry={() => void refetch()} compact />
                ) : !data || data.totalQuestions === 0 ? (
                  <EmptyState
                    compact
                    icon={<HelpCircle className="h-6 w-6" aria-hidden="true" />}
                    title={debounced ? 'No articles match that search' : 'No articles yet'}
                    description={
                      debounced
                        ? 'Try a different word, or send us a message and we will help directly.'
                        : 'Send us a message below and we will get back to you.'
                    }
                  />
                ) : (
                  <>
                    <p className="text-xs ss-subtle">
                      {data.totalQuestions} {data.totalQuestions === 1 ? 'article' : 'articles'}
                      {debounced ? ` matching “${debounced}”` : ''}
                    </p>
                    {data.categories.map((category) => (
                      <div key={category.category}>
                        <h3 className="text-sm font-semibold">{category.category}</h3>
                        <ul className="mt-2 space-y-2">
                          {category.items.map((item) => (
                            <li key={item.q}>
                              <details className="rounded-xl border bg-[rgb(var(--ss-bg))] px-4 py-3">
                                <summary className="cursor-pointer text-sm font-medium">{item.q}</summary>
                                <p className="mt-2 text-sm ss-muted">{item.a}</p>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                )}
              </CardBody>
            </Card>
          </section>

          <section id="safety" aria-labelledby="safety-heading" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="Safety and reporting"
                description="What to do if something goes wrong."
                icon={<Shield className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody className="space-y-3 text-sm ss-muted">
                <p>
                  Every conversation, post, review and profile has a report option. Reports go to the
                  moderation queue with the relevant content attached, and your name is not shown to the
                  person you reported.
                </p>
                <p>
                  You can block a member from their profile or from a conversation. Blocking hides you from
                  each other in discovery and matching and stops new messages and requests, while existing
                  exchanges keep their history.
                </p>
                <p>
                  Before meeting in person for the first time, use a public place, tell someone where you are
                  going, and keep the first session short. SkillSpring does not run background checks and
                  cannot verify identity beyond email ownership, so exercise the same judgement you would with
                  any stranger.
                </p>
              </CardBody>
            </Card>
          </section>

          <section id="limitations" aria-labelledby="limitations-heading" className="scroll-mt-24">
            <Card className="border-amber-500/35">
              <CardHeader
                title="Platform limitations"
                description="Stated plainly, so you know what to expect."
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <ul className="space-y-2.5 text-sm ss-muted">
                  {[
                    'No payments are processed. SkillSpring is a time-for-time exchange, and there is no way to buy or sell sessions here.',
                    'Email delivery and file storage depend on services an operator configures. If they are not configured, verification tokens and uploads fall back to local handling, which the interface states where it applies.',
                    'Reviews cannot be edited or deleted after submission. This is deliberate — it keeps the record honest.',
                    'Match quality depends on how specific your skill entries are. Broad entries like “programming” match poorly.',
                    'Deleting your account anonymises completed exchanges rather than destroying them, so your former partners keep their learning history.',
                    'We make no compliance certifications or legal claims beyond what is written in the privacy policy and terms.',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </section>
        </div>

        {/* ----------------------------------------------------- sidebar */}
        <div className="space-y-6">
          {/* Integration status: honest about what is configured */}
          {integrations ? (
            <Card>
              <CardHeader
                title="What is configured here"
                description="This deployment's optional integrations."
                icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody>
                <ul className="space-y-2.5 text-sm">
                  {[
                    { label: 'Email delivery', on: integrations.emailDelivery.enabled, detail: integrations.emailDelivery.provider },
                    { label: 'Live updates (realtime)', on: integrations.realtime.enabled, detail: integrations.realtime.provider },
                    { label: 'AI assistance', on: integrations.aiAssistance.enabled, detail: integrations.aiAssistance.provider },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center justify-between gap-3">
                      <span className="ss-muted">{item.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          item.on
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
                        )}
                      >
                        {item.on ? item.detail : 'Not configured'}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3">
                    <span className="ss-muted">File storage</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-500/15 dark:text-slate-300">
                      {integrations.objectStorage.provider}
                    </span>
                  </li>
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {/* Contact form */}
          <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24">
            <Card>
              <CardHeader
                title="Contact us"
                description="We usually reply within two working days."
                icon={<Mail className="h-4 w-4" aria-hidden="true" />}
              />
              <CardBody className="space-y-4">
                {reference ? (
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-50/60 p-4 text-sm dark:bg-emerald-500/5">
                    <p className="font-semibold">Message received</p>
                    <p className="mt-1 ss-muted">
                      Your reference is <strong className="font-mono">{reference}</strong>. Quote it if you
                      follow up.
                    </p>
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => setReference(null)}>
                      Send another message
                    </Button>
                  </div>
                ) : (
                  <>
                    {formError ? (
                      <p role="alert" className="rounded-lg border border-rose-500/35 bg-rose-50/60 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300">
                        {formError}
                      </p>
                    ) : null}
                    <TextField
                      label="Your name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      maxLength={80}
                    />
                    <TextField
                      label="Email address"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      hint="So we can reply. Not used for anything else."
                    />
                    <SelectField
                      label="What is this about?"
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      options={[
                        { value: 'TECHNICAL', label: 'Something is broken' },
                        { value: 'ACCOUNT', label: 'My account or profile' },
                        { value: 'MODERATION', label: 'Report or moderation' },
                        { value: 'PRIVACY', label: 'Privacy or my data' },
                        { value: 'FEEDBACK', label: 'Feedback or a suggestion' },
                        { value: 'OTHER', label: 'Something else' },
                      ]}
                    />
                    <TextAreaField
                      label="Message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      maxLength={2000}
                      showCount
                      required
                      className="min-h-[140px]"
                      placeholder="Include what you were doing, what you expected and what happened instead."
                    />
                    <Button
                      fullWidth
                      onClick={send}
                      loading={submitTicket.isPending}
                      leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                    >
                      Send message
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>
          </section>

          <Card>
            <CardBody>
              <h2 className="font-display text-base font-semibold">Legal documents</h2>
              <p className="mt-1.5 text-sm ss-muted">
                Written in plain language, with no claims we cannot stand behind.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/privacy">
                  <Button variant="secondary" size="sm">
                    Privacy policy
                  </Button>
                </Link>
                <Link to="/terms">
                  <Button variant="secondary" size="sm">
                    Terms of use
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
