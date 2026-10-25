import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type Theme } from '@/providers/ThemeProvider';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * Theme switcher. A radiogroup rather than a button cycle so the current choice
 * is announced and reachable by keyboard.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const CurrentIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Appearance: ${theme}. Change theme`}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border bg-[rgb(var(--ss-bg-alt))] px-2.5 py-2 text-sm transition-colors hover:border-[rgb(var(--ss-ring))]',
          compact && 'px-2',
        )}
      >
        <CurrentIcon className="h-4 w-4" aria-hidden="true" />
        {!compact ? <span className="hidden capitalize sm:inline">{theme}</span> : null}
      </button>

      {open ? (
        <div
          role="radiogroup"
          aria-label="Colour theme"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border bg-[rgb(var(--ss-bg-alt))] p-1 shadow-lg"
        >
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={theme === option.value}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  theme === option.value
                    ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'hover:bg-[rgb(var(--ss-border)/0.55)]',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
