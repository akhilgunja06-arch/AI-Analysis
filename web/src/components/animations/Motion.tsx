import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/providers/ThemeProvider';

/**
 * Fades and lifts children into view once, the first time they are seen.
 * When reduced motion is on, content simply appears.
 */
export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  // The wrapper renders through motion[as]; the cast keeps the props honest
  // without repeating one component per tag.
  const MotionTag = motion[as] as typeof motion.div;

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <MotionTag
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </MotionTag>
  );
}

/** Staggers direct children as they enter the viewport. */
export function StaggerList({
  children,
  className,
  staggerDelay = 0.06,
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  if (prefersReducedMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: staggerDelay } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  if (prefersReducedMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 18 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Counts up to a value when it scrolls into view. Purely presentational: the
 * final value is rendered immediately for reduced-motion users and for
 * assistive technology.
 */
export function AnimatedCounter({
  value,
  duration = 1.2,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(spring, (latest) =>
    `${prefix}${latest.toFixed(decimals)}${suffix}`,
  );
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (inView) motionValue.set(value);
  }, [inView, motionValue, value, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return (
      <span ref={ref} className={className}>
        {prefix}
        {value.toFixed(decimals)}
        {suffix}
      </span>
    );
  }

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${value}${suffix}`}>
      {settled ? (
        `${prefix}${value.toFixed(decimals)}${suffix}`
      ) : (
        <motion.span onAnimationComplete={() => setSettled(true)}>{display}</motion.span>
      )}
    </span>
  );
}

/**
 * Circular progress ring for profile completion and exchange progress.
 * The accessible value is exposed through role="progressbar".
 */
export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  label,
  sublabel,
  className,
  tone = 'brand',
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  className?: string;
  tone?: 'brand' | 'emerald' | 'amber';
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    tone === 'emerald'
      ? 'stroke-emerald-500'
      : tone === 'amber'
        ? 'stroke-amber-500'
        : 'stroke-brand-500';

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === 'string' ? label : 'Progress'}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-[rgb(var(--ss-border))]"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={strokeColor}
          strokeDasharray={circumference}
          initial={prefersReducedMotion ? { strokeDashoffset: offset } : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: prefersReducedMotion ? 0 : 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-xl font-bold tabular-nums">{Math.round(clamped)}%</span>
        {sublabel ? <span className="mt-0.5 text-[10px] ss-subtle">{sublabel}</span> : null}
      </div>
    </div>
  );
}

/** Horizontal progress bar with an accessible value. */
export function ProgressBar({
  value,
  label,
  className,
  tone = 'brand',
  showValue = false,
}: {
  value: number;
  label?: string;
  className?: string;
  tone?: 'brand' | 'emerald' | 'amber' | 'electric';
  showValue?: boolean;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const clamped = Math.max(0, Math.min(100, value));
  const tones = {
    brand: 'bg-brand-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    electric: 'bg-electric-500',
  } as const;

  return (
    <div className={className}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          {label ? <span className="ss-muted">{label}</span> : <span />}
          {showValue ? <span className="font-semibold tabular-nums">{Math.round(clamped)}%</span> : null}
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--ss-border))]"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <motion.div
          className={cn('h-full rounded-full', tones[tone])}
          initial={prefersReducedMotion ? { width: `${clamped}%` } : { width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

/** Page-level fade used by the route transition wrapper. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  if (prefersReducedMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
