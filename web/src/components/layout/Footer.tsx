import { Link } from 'react-router-dom';
import { Github, Linkedin, Mail } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

const COLUMNS = [
  {
    title: 'Platform',
    links: [
      { to: '/explore', label: 'Explore skills' },
      { to: '/members', label: 'Find members' },
      { to: '/community', label: 'Community' },
      { to: '/register', label: 'Create an account' },
    ],
  },
  {
    title: 'Learn more',
    links: [
      { to: '/help', label: 'Help centre' },
      { to: '/help#how-it-works', label: 'How exchanges work' },
      { to: '/help#limitations', label: 'Platform limitations' },
      { to: '/help#safety', label: 'Safety and reporting' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/privacy', label: 'Privacy policy' },
      { to: '/terms', label: 'Terms of use' },
      { to: '/help#contact', label: 'Contact us' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t bg-[rgb(var(--ss-bg-alt))]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size={30} />
            <p className="mt-4 max-w-sm text-sm ss-muted">
              A peer-to-peer skills exchange. Teach what you know, learn what you want, and settle the
              difference in time rather than money.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="SkillSpring on GitHub"
                className="rounded-lg border p-2 transition-colors hover:border-[rgb(var(--ss-ring))]"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="SkillSpring on LinkedIn"
                className="rounded-lg border p-2 transition-colors hover:border-[rgb(var(--ss-ring))]"
              >
                <Linkedin className="h-4 w-4" aria-hidden="true" />
              </a>
              <Link
                to="/help#contact"
                aria-label="Contact SkillSpring"
                className="rounded-lg border p-2 transition-colors hover:border-[rgb(var(--ss-ring))]"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-semibold">{column.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.to + link.label}>
                    <Link
                      to={link.to}
                      className="text-sm ss-muted transition-colors hover:text-[rgb(var(--ss-text))]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t pt-6 sm:flex-row sm:items-center">
          <p className="text-xs ss-subtle">
            © {new Date().getFullYear()} SkillSpring. An independent project — not affiliated with any other
            professional network.
          </p>
          <p className="text-xs ss-subtle">
            No payments are processed. Session times are shown in your own timezone.
          </p>
        </div>
      </div>
    </footer>
  );
}
