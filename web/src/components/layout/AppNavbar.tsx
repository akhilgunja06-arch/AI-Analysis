import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  Compass,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Star,
  Users,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '@/providers/AuthProvider';
import { useUnreadCount } from '@/hooks/queries';

export const MEMBER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/matches', label: 'Matches', icon: Sparkles },
  { to: '/exchanges', label: 'Exchanges', icon: Users },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/learning', label: 'Learning', icon: GraduationCap },
  { to: '/community', label: 'Community', icon: BookOpen },
];

/**
 * Primary navigation for signed-in members.
 *
 * Renders a horizontal bar on large screens and a slide-down sheet on mobile.
 * The current page is marked with aria-current and a visible indicator.
 */
export function AppNavbar() {
  const { user, profile, signOut, isStaff } = useAuth();
  const { data: unreadMessages = 0 } = useUnreadCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [userMenuOpen]);

  const displayName = profile?.displayName ?? user?.username ?? 'Member';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 border-b ss-glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/dashboard" className="shrink-0" aria-label="SkillSpring dashboard">
          <Logo size={30} />
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {MEMBER_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn('ss-nav-link inline-flex items-center gap-1.5', isActive && 'ss-nav-link-active')}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
                {item.to === '/messages' && unreadMessages > 0 ? (
                  <span className="ml-0.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle compact />
          <NotificationBell />

          {/* Account menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2 rounded-lg border bg-[rgb(var(--ss-bg-alt))] p-1 pr-2 transition-colors hover:border-[rgb(var(--ss-ring))]"
            >
              <Avatar name={displayName} src={profile?.avatarUrl} seed={user?.username} size="sm" />
              <ChevronDown className="h-3.5 w-3.5 ss-subtle" aria-hidden="true" />
              <span className="sr-only">Account menu</span>
            </button>

            {userMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border bg-[rgb(var(--ss-bg-alt))] p-1 shadow-xl"
              >
                <div className="border-b px-3 py-2.5">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs ss-subtle">@{user?.username}</p>
                </div>
                <Link
                  to={`/members/${user?.username}`}
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  My public profile
                </Link>
                <Link
                  to="/my-skills"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                >
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  My skills
                </Link>
                <Link
                  to="/reviews"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                >
                  <Star className="h-4 w-4" aria-hidden="true" />
                  Reviews
                </Link>
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Settings
                </Link>
                {isStaff ? (
                  <Link
                    to="/admin"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                  >
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    Admin panel
                  </Link>
                ) : null}
                <Link
                  to="/help"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[rgb(var(--ss-border)/0.55)]"
                >
                  <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                  Help
                </Link>
                <div className="my-1 h-px bg-[rgb(var(--ss-border))]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>

          {/* Mobile menu trigger */}
          <Button
            variant="secondary"
            size="sm"
            className="lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            Menu
          </Button>
        </div>
      </div>

      {/* Mobile navigation sheet */}
      {menuOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="border-t bg-[rgb(var(--ss-bg-alt))] px-4 py-3 lg:hidden"
        >
          <ul className="grid grid-cols-2 gap-1.5">
            {MEMBER_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                          : 'hover:bg-[rgb(var(--ss-border)/0.5)]',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                    {item.to === '/messages' && unreadMessages > 0 ? (
                      <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                        {unreadMessages}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              );
            })}
            {isStaff ? (
              <li>
                <NavLink
                  to="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[rgb(var(--ss-border)/0.5)]"
                >
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  Admin
                </NavLink>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
