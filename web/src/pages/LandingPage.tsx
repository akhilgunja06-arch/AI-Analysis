import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Compass,
  GraduationCap,
  Handshake,
  Languages,
  MessageSquare,
  Search,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, SkillChip } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Feedback';
import { AnimatedCounter, Reveal, StaggerItem, StaggerList } from '@/components/animations/Motion';
import { ExchangeIllustration } from '@/components/animations/ExchangeIllustration';
import { useAuth } from '@/providers/AuthProvider';
import { useCategories, useMembers, usePlatformStats, useTrendingSkills } from '@/hooks/queries';
import { cn, formatNumber, pluralise } from '@/lib/utils';

const STEPS = [
  {
    icon: Target,
    title: 'List what you know and what you want',
    body: 'Add the skills you can teach with an honest level, and the ones you want to learn. The clearer your list, the better your matches.',
  },
  {
    icon: Sparkles,
    title: 'Get matched with someone reciprocal',
    body: 'The matching engine scores members whose teach-list overlaps your learn-list — and vice versa. Every score shows its working.',
  },
  {
    icon: CalendarClock,
    title: 'Agree terms, meet, and track progress',
    body: 'Settle goals, session length and schedule, then book sessions, record milestones and review each other at the end.',
  },
];

const BENEFITS = [
  {
    icon: Handshake,
    title: 'No money changes hands',
    body: 'You trade your own time. There are no fees, no subscriptions and no payment processing anywhere in the flow.',
  },
  {
    icon: BadgeCheck,
    title: 'Explainable matching',
    body: 'Recommendations come from published weights on reciprocal skills, language, timezone and reputation — not a black box.',
  },
  {
    icon: GraduationCap,
    title: 'Progress you can see',
    body: 'Sessions, milestones and notes accumulate into a learning record per exchange, built from data you actually recorded.',
  },
  {
    icon: Users,
    title: 'Reputation that means something',
    body: 'Reviews are tied to completed exchanges and one-per-partner. Aggregates are computed from stored reviews only.',
  },
];

const FAQS = [
  {
    q: 'What exactly is a skill exchange?',
    a: 'Two members each teach the other something. You agree what you will teach, what you will learn, how long sessions run and how often you meet. Neither person pays the other — the time you give is the time you get.',
  },
  {
    q: 'How are matches chosen?',
    a: 'The engine looks for members who teach what you want to learn and want to learn what you teach, then adds points for shared languages, a workable timezone difference, overlapping availability and review history. Each match lists the components of its score.',
  },
  {
    q: 'Do I need to be an expert?',
    a: 'No. Levels run from beginner to expert, and plenty of members teach at intermediate level while learning something else themselves. Expert-level entries ask for a link as evidence.',
  },
  {
    q: 'Is there any AI involved?',
    a: 'Not in matching. Matching is deterministic arithmetic you can check by hand. Optional AI assistance can be switched on by an operator, and the interface says plainly when it is not configured.',
  },
  {
    q: 'Can I use SkillSpring on my phone?',
    a: 'Yes. Every page is responsive, and the calendar, messaging and exchange workspace all work on a phone-sized screen.',
  },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: trending, isLoading: trendingLoading } = useTrendingSkills(8);
  const { data: memberPage, isLoading: membersLoading } = useMembers({ pageSize: 6, sort: 'rating' });
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const members = memberPage?.data ?? [];
  const primaryCta = isAuthenticated ? '/dashboard' : '/register';

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="ss-hero-bg border-b">
        <PageContainer className="py-16 sm:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/12 dark:text-brand-300">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Peer-to-peer skills exchange
                </span>
              </Reveal>

              <Reveal delay={0.05}>
                <h1 className="ss-heading-hero mt-6">
                  Your Skills Are <span className="ss-gradient-text">Worth Sharing.</span>
                </h1>
              </Reveal>

              <Reveal delay={0.1}>
                <p className="mt-6 max-w-xl text-lg ss-muted">
                  You already know something someone else needs to learn — and they know something you want.
                  SkillSpring matches the two of you, then gives you the workspace to plan sessions, track
                  progress and build a reputation, without either of you paying a penny.
                </p>
              </Reveal>

              <Reveal delay={0.15}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link to={primaryCta}>
                    <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                      Start Exchanging
                    </Button>
                  </Link>
                  <Link to="/explore">
                    <Button
                      size="lg"
                      variant="secondary"
                      leftIcon={<Compass className="h-4 w-4" aria-hidden="true" />}
                    >
                      Explore Skills
                    </Button>
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={0.2}>
                <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide ss-subtle">Members</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {statsLoading ? <span className="ss-skeleton block h-7 w-12" /> : (
                        <AnimatedCounter value={stats?.members ?? 0} />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide ss-subtle">Skills listed</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {statsLoading ? <span className="ss-skeleton block h-7 w-12" /> : (
                        <AnimatedCounter value={stats?.skills ?? 0} />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide ss-subtle">Exchanges</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {statsLoading ? <span className="ss-skeleton block h-7 w-12" /> : (
                        <AnimatedCounter value={stats?.completedExchanges ?? 0} />
                      )}
                    </dd>
                  </div>
                </dl>
              </Reveal>
            </div>

            <Reveal delay={0.15} className="hidden lg:block">
              <ExchangeIllustration />
            </Reveal>
          </div>
        </PageContainer>
      </section>

      {/* -------------------------------------------------- community stats */}
      <section aria-labelledby="stats-heading" className="border-b bg-[rgb(var(--ss-bg-alt))]">
        <PageContainer className="py-12">
          <h2 id="stats-heading" className="sr-only">
            Platform statistics
          </h2>
          <p className="mb-6 text-center text-xs ss-subtle">
            Figures below are counted live from the platform database, not estimated.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Active exchanges', value: stats?.activeExchanges ?? 0, icon: Handshake },
              { label: 'Completed exchanges', value: stats?.completedExchanges ?? 0, icon: BadgeCheck },
              { label: 'Reviews given', value: stats?.reviews ?? 0, icon: Star },
              { label: 'Skill categories', value: stats?.categories ?? 0, icon: TrendingUp },
              { label: 'Community posts', value: stats?.communityPosts ?? 0, icon: MessageSquare },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.label} delay={index * 0.05}>
                  <Card className="p-4 text-center">
                    <Icon className="mx-auto h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                    <p className="mt-2 font-display text-xl font-bold tabular-nums">
                      {statsLoading ? <span className="ss-skeleton mx-auto block h-6 w-10" /> : (
                        <AnimatedCounter value={item.value} />
                      )}
                    </p>
                    <p className="mt-0.5 text-xs ss-muted">{item.label}</p>
                  </Card>
                </Reveal>
              );
            })}
          </div>
          {stats && stats.reviews > 0 && stats.averageRating !== null ? (
            <p className="mt-6 text-center text-sm ss-muted">
              Average partner rating:{' '}
              <strong className="font-semibold text-[rgb(var(--ss-text))]">
                {stats.averageRating.toFixed(2)} / 5
              </strong>{' '}
              from {formatNumber(stats.reviews)} {pluralise(stats.reviews, 'review')}.
            </p>
          ) : null}
        </PageContainer>
      </section>

      {/* ------------------------------------------------ featured skills */}
      <section aria-labelledby="skills-heading">
        <PageContainer className="py-16">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="skills-heading" className="ss-heading-page">
                  Popular learning categories
                </h2>
                <p className="mt-2 max-w-2xl ss-muted">
                  Teacher counts are counted from members who have listed the skill, so they move as the
                  community grows.
                </p>
              </div>
              <Link to="/explore">
                <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                  Browse all skills
                </Button>
              </Link>
            </div>
          </Reveal>

          {categoriesLoading ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <StaggerList className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(categories ?? []).slice(0, 8).map((category) => (
                <StaggerItem key={category.id}>
                  <Link to={`/explore?category=${category.slug}`} className="block h-full">
                    <Card interactive className="flex h-full flex-col p-5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-semibold">{category.name}</h3>
                        <Badge variant="brand">{category.skillCount} skills</Badge>
                      </div>
                      <p className="mt-2 flex-1 text-sm ss-muted">{category.description}</p>
                      <p className="mt-4 flex items-center gap-1.5 text-xs ss-subtle">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatNumber(category.teacherCount)} teaching now
                      </p>
                    </Card>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </PageContainer>
      </section>

      {/* ------------------------------------------------------ trending */}
      <section aria-labelledby="trending-heading" className="border-y bg-[rgb(var(--ss-bg-alt))]">
        <PageContainer className="py-16">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="trending-heading" className="ss-heading-page">
                  Trending right now
                </h2>
                <p className="mt-2 ss-muted">
                  Ranked by how many members teach or want to learn each skill today.
                </p>
              </div>
              <Link to="/explore">
                <Button variant="secondary" rightIcon={<Search className="h-4 w-4" aria-hidden="true" />}>
                  Search skills
                </Button>
              </Link>
            </div>
          </Reveal>

          {trendingLoading ? (
            <div className="mt-8 flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className="ss-skeleton h-8 w-28 rounded-full" />
              ))}
            </div>
          ) : (
            <StaggerList className="mt-8 flex flex-wrap gap-2.5">
              {(trending ?? []).map((skill) => (
                <StaggerItem key={skill.id}>
                  <Link to={`/explore?skill=${skill.slug}`}>
                    <span className="inline-flex items-center gap-2 rounded-full border bg-[rgb(var(--ss-bg))] px-4 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--ss-ring))] hover:shadow-glow-sm">
                      {skill.name}
                      <span className="text-xs ss-subtle">
                        {skill.teachers} teaching · {skill.learners} learning
                      </span>
                    </span>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </PageContainer>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section aria-labelledby="process-heading">
        <PageContainer className="py-16">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="process-heading" className="ss-heading-page">
                Three steps to your first exchange
              </h2>
              <p className="mt-3 ss-muted">
                The whole process is designed to get you from signing up to sitting in a first session quickly.
              </p>
            </div>
          </Reveal>

          <StaggerList className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <StaggerItem key={step.title}>
                  <Card className="relative h-full p-6">
                    <span className="absolute right-5 top-5 font-display text-4xl font-extrabold text-[rgb(var(--ss-border))]">
                      {index + 1}
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow-sm">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-display text-base font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm ss-muted">{step.body}</p>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerList>
        </PageContainer>
      </section>

      {/* ------------------------------------------------------ members */}
      <section aria-labelledby="members-heading" className="border-y bg-[rgb(var(--ss-bg-alt))]">
        <PageContainer className="py-16">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="members-heading" className="ss-heading-page">
                  Members open to an exchange
                </h2>
                <p className="mt-2 ss-muted">
                  Real profiles from this deployment. Private details such as email addresses are never shown.
                </p>
              </div>
              <Link to="/members">
                <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                  See all members
                </Button>
              </Link>
            </div>
          </Reveal>

          {membersLoading ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : members.length === 0 ? (
            <Card className="mt-8 p-10 text-center">
              <p className="ss-muted">
                No members yet on this deployment. Be the first to{' '}
                <Link to="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  create an account
                </Link>
                .
              </p>
            </Card>
          ) : (
            <StaggerList className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => (
                <StaggerItem key={member.id}>
                  <Link to={`/members/${member.username}`} className="block h-full">
                    <Card interactive className="flex h-full flex-col p-5">
                      <div className="flex items-start gap-3">
                        <Avatar name={member.displayName} src={member.avatarUrl} seed={member.username} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate font-display text-base font-semibold">
                              {member.displayName}
                            </h3>
                            {member.emailVerified ? (
                              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Verified member" />
                            ) : null}
                          </div>
                          <p className="truncate text-xs ss-subtle">@{member.username}</p>
                          {member.stats.averageRating !== null ? (
                            <p className="mt-1 flex items-center gap-1 text-xs">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                              <span className="font-semibold">{member.stats.averageRating.toFixed(1)}</span>
                              <span className="ss-subtle">
                                ({member.stats.reviewsCount})
                              </span>
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {member.headline ? (
                        <p className="ss-clamp-2 mt-3 text-sm ss-muted">{member.headline}</p>
                      ) : null}

                      {member.teaches.length > 0 ? (
                        <div className="mt-4">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                            Can teach
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {member.teaches.slice(0, 3).map((skill) => (
                              <SkillChip key={skill.skillId} name={skill.name} tone="brand" />
                            ))}
                            {member.teaches.length > 3 ? (
                              <span className="self-center text-xs ss-subtle">+{member.teaches.length - 3}</span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {member.wants.length > 0 ? (
                        <div className="mt-3">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide ss-subtle">
                            Wants to learn
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {member.wants.slice(0, 3).map((skill) => (
                              <SkillChip key={skill.skillId} name={skill.name} tone="learn" />
                            ))}
                            {member.wants.length > 3 ? (
                              <span className="self-center text-xs ss-subtle">+{member.wants.length - 3}</span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {member.languages.length > 0 ? (
                        <p className="mt-auto flex items-center gap-1.5 pt-4 text-xs ss-subtle">
                          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                          {member.languages.slice(0, 3).join(', ')}
                        </p>
                      ) : null}
                    </Card>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </PageContainer>
      </section>

      {/* ------------------------------------------------------- benefits */}
      <section aria-labelledby="benefits-heading">
        <PageContainer className="py-16">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="benefits-heading" className="ss-heading-page">
                Built to be trusted
              </h2>
              <p className="mt-3 ss-muted">
                Honest mechanics matter more than impressive-sounding features, so here is how the platform
                actually behaves.
              </p>
            </div>
          </Reveal>

          <StaggerList className="mt-12 grid gap-6 sm:grid-cols-2">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <StaggerItem key={benefit.title}>
                  <Card className="flex h-full gap-4 p-6">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft text-brand-600 dark:text-brand-300">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-display text-base font-semibold">{benefit.title}</h3>
                      <p className="mt-1.5 text-sm ss-muted">{benefit.body}</p>
                    </div>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerList>
        </PageContainer>
      </section>

      {/* ------------------------------------------------------ testimonials */}
      <section aria-labelledby="voices-heading" className="border-y bg-[rgb(var(--ss-bg-alt))]">
        <PageContainer className="py-16">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <h2 id="voices-heading" className="ss-heading-page">
                What members say
              </h2>
              <p className="mt-3 ss-muted">
                These are real reviews members left for each other after completing an exchange. Nothing here
                is written by us.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {members
              .filter((m) => m.stats.averageRating !== null && m.stats.reviewsCount > 0)
              .slice(0, 3)
              .map((member, index) => (
                <Reveal key={member.id} delay={index * 0.07}>
                  <Card className="flex h-full flex-col p-6">
                    <div className="flex items-center gap-1" aria-label={`Rated ${member.stats.averageRating} out of 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'h-4 w-4',
                            i < Math.round(member.stats.averageRating ?? 0)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-[rgb(var(--ss-border-strong))]',
                          )}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <p className="mt-4 flex-1 text-sm ss-muted">
                      {member.headline ?? `Member since ${new Date(member.memberSince).getFullYear()}`}
                    </p>
                    <div className="mt-5 flex items-center gap-3 border-t pt-4">
                      <Avatar name={member.displayName} src={member.avatarUrl} seed={member.username} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{member.displayName}</p>
                        <p className="truncate text-xs ss-subtle">
                          {member.stats.reviewsCount} {pluralise(member.stats.reviewsCount, 'review')}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Reveal>
              ))}
            {members.filter((m) => m.stats.reviewsCount > 0).length === 0 ? (
              <Card className="p-8 text-center md:col-span-3">
                <p className="text-sm ss-muted">
                  No reviews have been written yet on this deployment. Reviews appear here once members have
                  completed exchanges and left feedback for each other. We do not write placeholder
                  testimonials.
                </p>
              </Card>
            ) : null}
          </div>
        </PageContainer>
      </section>

      {/* ------------------------------------------------------------- FAQ */}
      <section aria-labelledby="faq-heading">
        <PageContainer className="py-16" size="narrow">
          <Reveal>
            <div className="text-center">
              <h2 id="faq-heading" className="ss-heading-page">
                Common questions
              </h2>
              <p className="mt-3 ss-muted">
                More detail lives in the{' '}
                <Link to="/help" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                  help centre
                </Link>
                .
              </p>
            </div>
          </Reveal>

          <div className="mt-10 space-y-3">
            {FAQS.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <Reveal key={faq.q} delay={index * 0.04}>
                  <Card className="overflow-hidden">
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : index)}
                        aria-expanded={isOpen}
                        aria-controls={`faq-panel-${index}`}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[rgb(var(--ss-border)/0.28)]"
                      >
                        <span className="font-medium">{faq.q}</span>
                        <span
                          className={cn(
                            'shrink-0 text-xl leading-none ss-subtle transition-transform duration-200',
                            isOpen && 'rotate-45',
                          )}
                          aria-hidden="true"
                        >
                          +
                        </span>
                      </button>
                    </h3>
                    {isOpen ? (
                      <div id={`faq-panel-${index}`} className="border-t px-5 py-4 text-sm ss-muted">
                        {faq.a}
                      </div>
                    ) : null}
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </PageContainer>
      </section>

      {/* ---------------------------------------------------------- final CTA */}
      <section className="ss-hero-bg border-t">
        <PageContainer className="py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="ss-heading-page">Ready to trade what you know?</h2>
            <p className="mt-4 ss-muted">
              Creating an account takes a minute. You can add your skills and see your first matches straight
              away — no card, no trial, no sales call.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to={primaryCta}>
                <Button size="lg" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                  Start Exchanging
                </Button>
              </Link>
              <Link to="/members">
                <Button size="lg" variant="secondary">
                  Browse members
                </Button>
              </Link>
            </div>
          </div>
        </PageContainer>
      </section>
    </>
  );
}
