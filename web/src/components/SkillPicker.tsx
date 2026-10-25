import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useCategories, useSkillSearch } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Feedback';

/**
 * Searchable skill picker backed by the real taxonomy.
 *
 * Typing searches the API (debounced); if there is no match the member can
 * request the skill be added to the taxonomy rather than being blocked.
 */
export function SkillPicker({
  value,
  onChange,
  placeholder = 'Search for a skill…',
  excludeIds = [],
  autoFocus = false,
  label = 'Skill',
}: {
  value: { id: string; name: string } | null;
  onChange: (skill: { id: string; name: string } | null) => void;
  placeholder?: string;
  excludeIds?: string[];
  autoFocus?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: categories } = useCategories();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: skills, isFetching } = useSkillSearch(debounced, undefined, open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const options = useMemo(
    () => (skills ?? []).filter((skill) => !excludeIds.includes(skill.id)).slice(0, 40),
    [skills, excludeIds],
  );

  if (value) {
    return (
      <div>
        <span className="ss-label">{label}</span>
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-[rgb(var(--ss-bg-alt))] px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
            {value.name}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery('');
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="rounded-lg p-1 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-[rgb(var(--ss-border)/0.6)]"
            aria-label={`Clear ${value.name}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="skill-picker-input" className="ss-label">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]" aria-hidden="true" />
        <input
          id="skill-picker-input"
          ref={inputRef}
          className="ss-input pl-10"
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="skill-picker-listbox"
          aria-autocomplete="list"
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open ? (
        <div
          id="skill-picker-listbox"
          role="listbox"
          className="absolute z-30 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border bg-[rgb(var(--ss-bg-alt))] p-1.5 shadow-xl"
        >
          {isFetching && options.length === 0 ? (
            <div className="space-y-1.5 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : options.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm ss-muted">
              {debounced.length === 0 ? (
                <>Start typing to search {categories ? `${categories.length} categories` : 'the skill list'}.</>
              ) : (
                <>
                  No skill matches “{debounced}”.
                  <span className="mt-1 block text-xs ss-subtle">
                    Ask a moderator to add it to the taxonomy, or pick the closest existing skill.
                  </span>
                </>
              )}
            </div>
          ) : (
            <ul>
              {options.map((skill) => (
                <li key={skill.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onChange({ id: skill.id, name: skill.name });
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]',
                    )}
                  >
                    <span className="font-medium">{skill.name}</span>
                    <span className="shrink-0 text-xs ss-subtle">{skill.category.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
