import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { ApiError } from '@/lib/api';

/** A shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('ss-skeleton', className)} aria-hidden="true" />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('ss-card p-5', className)} aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

/** A grid of skeleton cards, used while a list loads. */
export function SkeletonGrid({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
      )}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading content"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state. Always explains what would appear here and, where the member can
 * act, offers the action rather than leaving a dead end.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed text-center',
        compact ? 'px-5 py-8' : 'px-6 py-14',
        className,
      )}
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand-soft text-brand-600 dark:text-brand-300">
        {icon ?? <Inbox className="h-7 w-7" aria-hidden="true" />}
      </span>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm ss-muted">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Error state. Turns an ApiError into something a person can act on: a clear
 * sentence, the server's own message where it is useful, and a retry.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const offline = apiError?.isNetworkError ?? false;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-50/50 text-center dark:bg-rose-500/5',
        compact ? 'px-5 py-8' : 'px-6 py-12',
        className,
      )}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-600 dark:text-rose-400">
        {offline ? <WifiOff className="h-6 w-6" aria-hidden="true" /> : <AlertCircle className="h-6 w-6" aria-hidden="true" />}
      </span>
      <h3 className="font-display text-base font-semibold">
        {title ?? (offline ? 'You appear to be offline' : 'Something went wrong')}
      </h3>
      <p className="mt-2 max-w-md text-sm ss-muted">
        {apiError?.message ?? 'We could not load this. Please try again.'}
      </p>
      {apiError?.isRateLimited ? (
        <p className="mt-1 text-xs ss-subtle">Please wait a moment before trying again.</p>
      ) : null}
      {onRetry ? (
        <Button
          variant="secondary"
          className="mt-5"
          onClick={onRetry}
          leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Full-section loading spinner with an accessible label. */
export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true" />
      <span className="text-sm ss-muted">{label}…</span>
    </div>
  );
}

/** Shown when a feature depends on an optional integration that is off. */
export function NotConfiguredState({
  title,
  description,
  integration,
}: {
  title: string;
  description: ReactNode;
  integration?: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/35 bg-amber-50/60 p-6 dark:bg-amber-500/5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <p className="mt-1.5 text-sm ss-muted">{description}</p>
          {integration ? (
            <p className="mt-2 font-mono text-xs ss-subtle">Integration: {integration}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
