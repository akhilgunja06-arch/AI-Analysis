import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The SkillSpring mark: two arcs springing from a shared centre, representing
 * two people exchanging knowledge. Deliberately geometric and original.
 */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="SkillSpring"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4F46E5" />
          <stop offset="0.5" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      {/* Upper arc: teaching outward */}
      <path
        d="M11 24.5c0-6.6 4-11.5 9.2-11.5 3.1 0 5.4 1.6 6.6 4.1"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.95"
      />
      {/* Lower arc: learning inward, mirrored */}
      <path
        d="M29 15.5c0 6.6-4 11.5-9.2 11.5-3.1 0-5.4-1.6-6.6-4.1"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.72"
      />
      {/* The exchanged spark at the centre */}
      <circle cx="20" cy="20" r="2.6" fill="white" />
    </svg>
  );
}

/** Full lock-up: mark plus wordmark. */
export function Logo({
  className,
  size = 32,
  showWordmark = true,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {showWordmark ? (
        <span className="font-display text-lg font-extrabold tracking-tight">
          Skill<span className="ss-gradient-text">Spring</span>
        </span>
      ) : null}
    </span>
  );
}
