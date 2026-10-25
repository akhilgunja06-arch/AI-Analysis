import { useState, type ReactNode } from 'react';
import { cn, avatarTint, initials } from '@/lib/utils';
import { assetUrl } from '@/lib/api';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZES: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
  '2xl': 'h-28 w-28 text-3xl',
};

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  /** A stable seed for the fallback colour; defaults to the name. */
  seed?: string;
  className?: string;
  /** Adds a subtle ring, used on hoverable member cards. */
  ring?: boolean;
  status?: 'online' | 'offline' | null;
};

/**
 * Member avatar. Falls back to deterministic initials when there is no image, so
 * the interface never shows a broken image or an empty circle.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  seed,
  className,
  ring = false,
  status = null,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const resolved = assetUrl(src);
  const showImage = Boolean(resolved) && !failed;

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center overflow-hidden rounded-full font-semibold text-white',
          SIZES[size],
          !showImage && `bg-gradient-to-br ${avatarTint(seed ?? name)}`,
          ring && 'ring-2 ring-white/70 dark:ring-navy-900/70',
        )}
        aria-hidden={showImage ? undefined : true}
      >
        {showImage ? (
          <img
            src={resolved!}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          initials(name)
        )}
      </span>
      {status ? (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full ring-2 ring-[rgb(var(--ss-bg))]',
            size === 'xs' || size === 'sm' ? 'h-2 w-2' : 'h-3 w-3',
            status === 'online' ? 'bg-emerald-500' : 'bg-slate-400',
          )}
          title={status === 'online' ? 'Online' : 'Offline'}
        >
          <span className="sr-only">{status === 'online' ? 'Online' : 'Offline'}</span>
        </span>
      ) : null}
    </span>
  );
}

/** Overlapping avatars for exchange participants. */
export function AvatarGroup({
  people,
  max = 3,
  size = 'md',
}: {
  people: { name: string; src?: string | null; username?: string }[];
  max?: number;
  size?: AvatarSize;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((person, index) => (
        <Avatar
          key={person.username ?? `${person.name}-${index}`}
          name={person.name}
          src={person.src}
          seed={person.username ?? person.name}
          size={size}
          ring
        />
      ))}
      {extra > 0 ? (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-[rgb(var(--ss-border))] font-semibold text-[rgb(var(--ss-text-muted))] ring-2 ring-[rgb(var(--ss-bg))]',
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

export function AvatarWithName({
  name,
  username,
  src,
  size = 'md',
  subtitle,
  right,
}: {
  name: string;
  username?: string;
  src?: string | null;
  size?: AvatarSize;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} src={src} seed={username ?? name} size={size} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        {subtitle ? <div className="truncate text-xs ss-muted">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}
