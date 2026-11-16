import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Compass,
  Handshake,
  HeartHandshake,
  Lock,
  MessageSquare,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { AnimatedCounter } from '@/components/animations/Motion';
import { Reveal } from '@/components/animations/Motion';
import { usePlatformStats } from '@/hooks/queries';
import { formatNumber, pluralise } from '@/lib/utils';

const PRINCIPLES = [
  {
    icon: Handshake,
    title: 'Time instead of money',
    body: 'You trade your own time. There are no fees, no subscriptions and no payment processing anywhere in the flow.',
  },
  {
    icon: Sparkles,
    title: 'Explainable matching',
    body: 'Recommendations come from published weights on reciprocal skills, language, timezone and reputation — not a black box.',
  },
  {
    icon: BadgeCheck,
    title: 'Reputation that means something',
    body: 'Reviews are tied to completed exchanges and one per partner. Aggregates are computed from stored reviews only.',
  },
  {
    icon: Lock,
    title: 'Private by default',
    body: 'Your email and other private details are never returned by the public directory. Access is enforced on the server for every request.',
  },
];

export default function AboutPage() {
  const { data: stats, isLoading } = usePlatformStats();

  const figures = [
    { label: 'Members', value: stats?.members ?? 0, icon: Users },
    { label: 'Skills listed', value: stats?.skills ?? 0, icon: Compass },
    { label: 'Completed exchanges', value: stats?.completedExchanges ?? 0, icon: Handshake },
    { label: 'Community posts', value: stats?.communityPosts ?? 0, icon: MessageSquare },
  ];

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/12 dark:text-brand-300">
          <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" />
          About SkillSpring
        </span>
        <h1 className="ss-heading-page mt-6">Skills are worth more when they move between people.</h1>
        <p className="mt-5 text-base ss-muted">
          SkillSpring is a peer-to-peer skill exchange. You teach something you know well and learn something you
          want, matched with another member who wants the opposite. Nobody pays anybody — the time you give is the
          time you get back.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {figures.map((figure, index) => {
          const Icon = figure.icon;
          return (
            <Reveal key={figure.label} delay={index * 0.05}>
              <Card className="p-5 text-center">
                <Icon className="mx-auto h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                  {isLoading ? <span className="ss-skeleton mx-auto block h-7 w-12" /> : (
                    <AnimatedCounter value={figure.value} />
                  )}
                </p>
                <p className="mt-0.5 text-xs ss-muted">{figure.label}</p>
              </Card>
            </Reveal>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs ss-subtle">
        These figures are counted live from the platform database, not estimated.
      </p>

      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="ss-heading-section">Why we built it</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed ss-muted">
            <p>
              Most people already hold a marketable skill and want to pick up another. The usual answer is a paid
              course, which costs money, or a video library, which costs motivation. SkillSpring takes a third
              route: find someone who wants what you have and has what you want, then swap.
            </p>
            <p>
              A direct swap means both people are invested. You show up because someone is relying on you, and you
              learn faster because you have to explain what you know. That reciprocity is the whole design.
            </p>
            <p>
              The platform is honest about its mechanics. Matching is deterministic arithmetic with published
              weights, not a machine-learning model. Reviews only count when they come from a completed exchange.
              Optional features such as the assistant say so plainly when they are not configured.
            </p>
          </div>
        </div>

        <div>
          <h2 className="ss-heading-section">How an exchange works</h2>
          <ol className="mt-4 space-y-4">
            {[
              'List what you can teach and what you want to learn.',
              'See members whose teach-list overlaps your learn-list, and vice versa.',
              'Send a request explaining what you will teach and what you want to learn.',
              'Agree the terms, then schedule sessions that fit both calendars.',
              'Meet, keep notes and milestones, and mark the exchange complete.',
              'Leave a review for each other. It is tied to that completed exchange.',
            ].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white">
                  {index + 1}
                </span>
                <span className="text-sm ss-muted">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/register">
              <Button rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>Start exchanging</Button>
            </Link>
            <Link to="/explore">
              <Button variant="secondary">Explore skills</Button>
            </Link>
          </div>
        </div>
      </div>

      <h2 className="ss-heading-section mt-14">What we stand for</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((principle) => {
          const Icon = principle.icon;
          return (
            <Card key={principle.title}>
              <CardBody className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand-soft text-brand-600 dark:text-brand-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{principle.title}</h3>
                  <p className="mt-1.5 text-sm ss-muted">{principle.body}</p>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card className="mt-12 border-brand-500/25 bg-gradient-brand-soft">
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Questions, feedback or a concern?</p>
                <p className="mt-1 text-sm ss-muted">
                  Read the help centre, or send us a message and we will answer it directly.
                  {stats && stats.reviews > 0
                    ? ` The community has left ${formatNumber(stats.reviews)} ${pluralise(stats.reviews, 'review')} so far.`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/contact">
                <Button size="sm">Contact us</Button>
              </Link>
              <Link to="/help">
                <Button size="sm" variant="secondary">
                  Help centre
                </Button>
              </Link>
            </div>
          </div>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
