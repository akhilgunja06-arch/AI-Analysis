import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, LogIn, Menu, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '@/providers/AuthProvider';

const PUBLIC_LINKS = [
  { to: '/explore', label: 'Explore skills' },
  { to: '/members', label: 'Members' },
  { to: '/community', label: 'Community' },
  { to: '/help', label: 'Help' },
];

/** Header for signed-out visitors. */
export function PublicNavbar() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        scrolled ? 'border-b ss-glass shadow-sm' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0" aria-label="SkillSpring home">
          <Logo size={30} />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => cn('ss-nav-link', isActive && 'ss-nav-link-active')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle compact />

          {isAuthenticated ? (
            <Button
              size="sm"
              rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                window.location.href = '/dashboard';
              }}
            >
              Go to dashboard
            </Button>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm" leftIcon={<LogIn className="h-4 w-4" aria-hidden="true" />}>
                  Sign in
                </Button>
              </Link>
              <Link to="/register" className="hidden sm:block">
                <Button size="sm" rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
                  Start exchanging
                </Button>
              </Link>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-[rgb(var(--ss-bg-alt))] md:hidden"
                aria-expanded={open}
                aria-controls="public-mobile-nav"
                aria-label={open ? 'Close menu' : 'Open menu'}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
              </button>
            </>
          )}
        </div>
      </div>

      {open ? (
        <nav
          id="public-mobile-nav"
          aria-label="Main"
          className="border-t bg-[rgb(var(--ss-bg-alt))] px-4 py-3 md:hidden"
        >
          <ul className="space-y-1">
            {PUBLIC_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'hover:bg-[rgb(var(--ss-border)/0.5)]',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li className="flex gap-2 pt-2">
              <Link to="/login" className="flex-1" onClick={() => setOpen(false)}>
                <Button variant="secondary" fullWidth leftIcon={<LogIn className="h-4 w-4" aria-hidden="true" />}>
                  Sign in
                </Button>
              </Link>
              <Link to="/register" className="flex-1" onClick={() => setOpen(false)}>
                <Button fullWidth leftIcon={<UserPlus className="h-4 w-4" aria-hidden="true" />}>
                  Register
                </Button>
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
