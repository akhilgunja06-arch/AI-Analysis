import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Quote } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

/**
 * Split layout for authentication: the form on the left, a quiet brand panel on
 * the right that states what the product does without overselling it.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  panelPoints,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  panelPoints?: { title: string; body: string }[];
}) {
  const points = panelPoints ?? [
    {
      title: 'Trade time, not money',
      body: 'You teach what you know and learn what you want. No fees and no payments anywhere in the flow.',
    },
    {
      title: 'Matching you can audit',
      body: 'Recommendations use published weights on reciprocal skills, language, timezone and reputation.',
    },
    {
      title: 'A record of what you learned',
      body: 'Sessions, milestones and notes build a learning history you can look back on.',
    },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-8 lg:px-14">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="SkillSpring home">
            <Logo size={30} />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link to="/" className="ss-btn-ghost ss-btn-sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Link>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="ss-heading-page">{title}</h1>
          {subtitle ? <div className="mt-2 text-sm ss-muted">{subtitle}</div> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-6 text-center text-sm ss-muted">{footer}</div> : null}
        </div>
      </div>

      {/* Brand panel: decorative only, hidden on small screens. */}
      <aside className="relative hidden overflow-hidden border-l lg:block ss-hero-bg" aria-hidden="true">
        <div className="flex h-full flex-col justify-center px-14">
          <Quote className="h-8 w-8 text-brand-500/60" />
          <p className="mt-6 max-w-md font-display text-2xl font-semibold leading-snug">
            The fastest way to learn something is to find the person who wants to learn what you already know.
          </p>
          <ul className="mt-10 space-y-6">
            {points.map((point) => (
              <li key={point.title}>
                <p className="font-semibold">{point.title}</p>
                <p className="mt-1 max-w-sm text-sm ss-muted">{point.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
