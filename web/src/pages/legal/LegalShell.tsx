import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, FileText, Shield } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';

/**
 * Shared shell for the legal pages.
 *
 * These documents describe what this software actually does. They deliberately
 * make no compliance certifications or legal claims that the project cannot
 * substantiate, and they tell the reader to take professional advice where the
 * stakes are real.
 */
export function LegalShell({
  title,
  summary,
  lastUpdated,
  sections,
  otherLink,
}: {
  title: string;
  summary: string;
  lastUpdated: string;
  sections: { id: string; heading: string; body: ReactNode }[];
  otherLink: { to: string; label: string };
}) {
  return (
    <PageContainer size="narrow">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand text-white">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs ss-subtle">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Last updated {lastUpdated}
          </p>
        </div>
      </div>

      <p className="mt-5 text-base ss-muted">{summary}</p>

      <Card className="mt-6">
        <CardBody>
          <h2 className="text-sm font-semibold">Contents</h2>
          <ol className="mt-3 space-y-1.5">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-sm text-brand-600 transition-colors hover:underline dark:text-brand-300"
                >
                  {index + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      <div className="mt-8 space-y-8">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="font-display text-lg font-semibold">
              {index + 1}. {section.heading}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed ss-muted">{section.body}</div>
          </section>
        ))}
      </div>

      <Card className="mt-10 border-brand-500/25 bg-gradient-brand-soft">
        <CardBody>
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Questions about this document?</p>
              <p className="mt-1 text-sm ss-muted">
                Send us a message through the help centre and we will answer it directly.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/help#contact">
                  <Button size="sm">Contact us</Button>
                </Link>
                <Link to={otherLink.to}>
                  <Button size="sm" variant="secondary">
                    {otherLink.label}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
