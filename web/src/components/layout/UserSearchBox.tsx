import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare, Search, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMemberSearch, useStartConversation } from '@/hooks/queries';

/**
 * Username search for the navbar.
 *
 * Behaviour worth knowing:
 *  - Requests are debounced, so typing "priya" sends one call, not five.
 *  - Arrow keys move through results, Enter opens the highlighted member,
 *    Escape closes the list without clearing the query.
 *  - A member with an existing conversation offers "Message" directly; one
 *    without offers "Start chat", which creates it on demand.
 *  - A search that returns nothing says so, rather than showing a spinner
 *    forever or an empty box.
 */
export function UserSearchBox({ className }: { className?: string }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounced = useDebouncedValue(term, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const navigate = useNavigate();

  const { data: results = [], isFetching, isError } = useMemberSearch(debounced, open);
  const startConversation = useStartConversation();

  const trimmed = term.trim();
  const canSearch = trimmed.length >= 2;

  useEffect(() => {
    if (!open) return;
    const onClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  // A shorter result list must not leave the highlight pointing past its end.
  useEffect(() => {
    setActiveIndex((current) => (current >= results.length ? results.length - 1 : current));
  }, [results.length]);

  const openMember = (username: string) => {
    setOpen(false);
    setTerm('');
    navigate(`/members/${username}`);
  };

  const openChat = async (username: string, conversationId: string | null) => {
    setOpen(false);
    setTerm('');
    if (conversationId) {
      navigate(`/messages/${conversationId}`);
      return;
    }
    const result = await startConversation.mutateAsync({ username });
    navigate(`/messages/${result.data.conversationId}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        openMember(results[activeIndex].username);
      } else if (canSearch) {
        // No highlight: treat Enter as "show me everything matching this".
        setOpen(false);
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }
  };

  return (
    <div ref={containerRef} className={cn('relative w-full max-w-sm', className)}>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search people by username"
          aria-label="Search people by username"
          aria-expanded={open && canSearch}
          aria-controls={listId}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          className="w-full rounded-lg border border-slate-200 bg-white/80 py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
        />
        {isFetching && canSearch ? (
          <Loader2
            aria-hidden
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
          />
        ) : term ? (
          <button
            type="button"
            onClick={() => {
              setTerm('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && canSearch && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {isError && (
            <p className="px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
              Search is unavailable right now. Please try again.
            </p>
          )}

          {!isError && !isFetching && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              No member matches “{trimmed}”.
            </p>
          )}

          {results.length > 0 && (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((member, index) => (
                <li key={member.id} role="option" aria-selected={index === activeIndex}>
                  <div
                    className={cn(
                      'flex items-center gap-3 px-3 py-2',
                      index === activeIndex && 'bg-brand-50 dark:bg-slate-800',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openMember(member.username)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="relative shrink-0">
                        <Avatar
                          name={member.displayName || member.username}
                          src={member.avatarUrl}
                          size="sm"
                        />
                        {member.online && (
                          <span
                            aria-label="Online"
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {member.displayName}
                          <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                            @{member.username}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {member.headline ||
                            (member.teaches.length
                              ? `Teaches ${member.teaches.map((s) => s.name).join(', ')}`
                              : 'No headline yet')}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openChat(member.username, member.conversationId)}
                      disabled={startConversation.isPending}
                      aria-label={
                        member.conversationId
                          ? `Open your conversation with ${member.username}`
                          : `Start a chat with ${member.username}`
                      }
                      title={member.conversationId ? 'Open chat' : 'Start chat'}
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-brand-400"
                    >
                      {member.conversationId ? (
                        <MessageSquare className="h-4 w-4" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {results.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(`/search?q=${encodeURIComponent(trimmed)}`);
              }}
              className="block w-full border-t border-slate-100 px-4 py-2 text-left text-xs font-medium text-brand-600 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-400 dark:hover:bg-slate-800"
            >
              See all results for “{trimmed}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
