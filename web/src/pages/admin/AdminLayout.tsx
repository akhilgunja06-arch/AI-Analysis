import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, FolderTree, ScrollText, ShieldAlert, Users } from 'lucide-react';
import { PageContainer } from '@/components/layout/Layouts';
import { Card, CardBody } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';

const LINKS = [
  { to: '/admin', label: 'Overview', icon: BarChart3, end: true, adminOnly: false },
  { to: '/admin/users', label: 'Users', icon: Users, end: false, adminOnly: false },
  { to: '/admin/reports', label: 'Reports', icon: ShieldAlert, end: false, adminOnly: false },
  { to: '/admin/categories', label: 'Skill taxonomy', icon: FolderTree, end: false, adminOnly: true },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText, end: false, adminOnly: true },
];

/** Shell for the staff area. Access is enforced again on every API call. */
export default function AdminLayout() {
  const { isAdmin, user } = useAuth();

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ss-heading-page">Administration</h1>
          <p className="mt-2 max-w-2xl ss-muted">
            Signed in as <strong>@{user?.username}</strong>. Every action here is written to the audit log, and
            each one is authorised on the server as well as in this interface.
          </p>
        </div>
        <span
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-semibold capitalize',
            isAdmin
              ? 'border-brand-500/40 bg-brand-50 text-brand-700 dark:bg-brand-500/12 dark:text-brand-300'
              : 'border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
          )}
        >
          {isAdmin ? 'Administrator' : 'Moderator'}
        </span>
      </div>

      {!isAdmin ? (
        <Card className="mt-6">
          <CardBody className="text-sm ss-muted">
            As a moderator you can review reports and manage community content and users. Skill taxonomy and
            audit log access require an administrator role, and those links are hidden from you.
          </CardBody>
        </Card>
      ) : null}

      <nav aria-label="Admin sections" className="mt-6">
        <ul className="flex flex-wrap gap-1 rounded-xl border p-1">
          {LINKS.filter((link) => !link.adminOnly || isAdmin).map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                        : 'ss-muted hover:bg-[rgb(var(--ss-border)/0.5)]',
                    )
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {link.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6">
        <Outlet />
      </div>
    </PageContainer>
  );
}
