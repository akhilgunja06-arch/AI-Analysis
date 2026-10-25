import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  as?: 'div' | 'article' | 'li' | 'section';
};

export function Card({ interactive, as = 'div', className, children, ...rest }: CardProps) {
  // The element type is narrow on purpose; the cast keeps the props honest for
  // the common case without duplicating four near-identical components.
  const Tag = as as 'div';
  return (
    <Tag className={cn(interactive ? 'ss-card-interactive' : 'ss-card', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {description ? <p className="mt-0.5 text-xs ss-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-t px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}

/** A headline number with a label, used across dashboards. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  loading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'electric' | 'violet' | 'emerald' | 'amber' | 'rose';
  loading?: boolean;
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    electric: 'bg-electric-500/12 text-electric-600 dark:text-electric-300',
    violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide ss-subtle">{label}</p>
          {loading ? (
            <div className="ss-skeleton mt-2 h-8 w-20" />
          ) : (
            <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p>
          )}
          {hint ? <p className="mt-1 text-xs ss-muted">{hint}</p> : null}
        </div>
        {icon ? (
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

/** Section wrapper with a heading and optional action. */
export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn('space-y-4', className)} id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="ss-heading-section" id={id ? `${id}-title` : undefined}>
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm ss-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
