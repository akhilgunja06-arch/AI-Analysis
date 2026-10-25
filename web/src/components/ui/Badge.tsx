import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ExchangeStatus, SessionFormat, SkillLevel } from '@/lib/types';

export function Badge({
  children,
  variant = 'neutral',
  className,
  icon,
}: {
  children: ReactNode;
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  icon?: ReactNode;
}) {
  const variants = {
    neutral: 'ss-badge-neutral',
    brand: 'ss-badge-brand',
    success: 'ss-badge-success',
    warning: 'ss-badge-warning',
    danger: 'ss-badge-danger',
    info: 'ss-badge-info',
  } as const;

  return (
    <span className={cn(variants[variant], className)}>
      {icon}
      {children}
    </span>
  );
}

const EXCHANGE_TONE: Record<ExchangeStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
  PENDING: 'warning',
  COUNTERED: 'info',
  ACCEPTED: 'info',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'brand',
  DECLINED: 'danger',
  WITHDRAWN: 'neutral',
  CANCELLED: 'neutral',
};

/** Status pill for an exchange or request. Always shows the human label. */
export function ExchangeStatusBadge({ status, className }: { status: ExchangeStatus; className?: string }) {
  const labels: Record<ExchangeStatus, string> = {
    PENDING: 'Pending',
    COUNTERED: 'Counter-proposed',
    ACCEPTED: 'Accepted',
    ACTIVE: 'Active',
    PAUSED: 'Paused',
    COMPLETED: 'Completed',
    DECLINED: 'Declined',
    WITHDRAWN: 'Withdrawn',
    CANCELLED: 'Cancelled',
  };
  return (
    <Badge variant={EXCHANGE_TONE[status] ?? 'neutral'} className={className}>
      <span
        className={cn(
          'mr-1 inline-block h-1.5 w-1.5 rounded-full',
          status === 'ACTIVE' && 'animate-pulse bg-emerald-500',
          status === 'PENDING' && 'bg-amber-500',
          status === 'COMPLETED' && 'bg-brand-500',
          (status === 'CANCELLED' || status === 'DECLINED' || status === 'WITHDRAWN') && 'bg-slate-400',
        )}
        aria-hidden="true"
      />
      {labels[status] ?? status}
    </Badge>
  );
}

const LEVEL_TONE: Record<SkillLevel, string> = {
  BEGINNER: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  INTERMEDIATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  ADVANCED: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  EXPERT: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

export function SkillLevelBadge({ level, className }: { level: SkillLevel; className?: string }) {
  const labels: Record<SkillLevel, string> = {
    BEGINNER: 'Beginner',
    INTERMEDIATE: 'Intermediate',
    ADVANCED: 'Advanced',
    EXPERT: 'Expert',
  };
  return (
    <span className={cn('ss-badge', LEVEL_TONE[level], className)}>{labels[level] ?? level}</span>
  );
}

const FORMAT_LABEL: Record<SessionFormat, string> = {
  ONLINE: 'Online',
  IN_PERSON: 'In person',
  EITHER: 'Either',
};

export function FormatBadge({ format }: { format: SessionFormat }) {
  return <Badge variant="neutral">{FORMAT_LABEL[format] ?? format}</Badge>;
}

/** A skill chip with the direction implied by the icon slot. */
export function SkillChip({
  name,
  level,
  tone = 'neutral',
  onClick,
  title,
}: {
  name: string;
  level?: SkillLevel;
  tone?: 'neutral' | 'brand' | 'learn';
  onClick?: () => void;
  title?: string;
}) {
  const tones = {
    neutral: 'border bg-[rgb(var(--ss-bg-alt))] hover:border-[rgb(var(--ss-ring))]',
    brand: 'border border-brand-500/30 bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300',
    learn: 'border border-electric-500/30 bg-electric-500/10 text-electric-700 dark:text-electric-300',
  } as const;

  const content = (
    <>
      <span className="truncate">{name}</span>
      {level ? <span className="text-[10px] uppercase opacity-70">{level.slice(0, 3)}</span> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
          tones[tone],
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      title={title}
      className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', tones[tone])}
    >
      {content}
    </span>
  );
}

/** Small verified marker, only shown when the address really is verified. */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (!verified) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
      title="Email address verified"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M10 1.5l2.09 1.53 2.58-.2.9 2.44 2.13 1.47-.75 2.48.75 2.48-2.13 1.47-.9 2.44-2.58-.2L10 18.5l-2.09-1.53-2.58.2-.9-2.44L2.3 13.26l.75-2.48-.75-2.48 2.13-1.47.9-2.44 2.58.2L10 1.5zm3.03 6.02a.75.75 0 10-1.06-1.06L9 9.44 7.53 7.97a.75.75 0 10-1.06 1.06l2 2a.75.75 0 001.06 0l3.5-3.5z"
          clipRule="evenodd"
        />
      </svg>
      Verified
      <span className="sr-only">email address verified</span>
    </span>
  );
}
