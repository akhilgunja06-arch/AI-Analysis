import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppNavbar } from '@/components/layout/AppNavbar';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { Footer } from '@/components/layout/Footer';
import { LoadingState } from '@/components/ui/Feedback';
import { PageTransition } from '@/components/animations/Motion';
import { useAuth } from '@/providers/AuthProvider';
import { EmailVerificationBanner } from '@/components/layout/EmailVerificationBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/** Layout for public, indexable pages. */
export function PublicLayout() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      {isAuthenticated ? <AppNavbar /> : <PublicNavbar />}
      <main id="main" className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

/** Layout for the authenticated application. */
export function AppLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col bg-[rgb(var(--ss-bg))]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <AppNavbar />
      <EmailVerificationBanner />
      <main id="main" className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <AnimatePresence mode="wait" initial={false}>
              <PageTransition key={location.pathname}>
                <Outlet />
              </PageTransition>
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

/** Minimal layout for authentication and onboarding, without navigation. */
export function BareLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <main id="main" className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

/** Page container with consistent width and spacing. */
export function PageContainer({
  children,
  className,
  size = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  size?: 'default' | 'wide' | 'narrow';
}) {
  const widths = {
    narrow: 'max-w-3xl',
    default: 'max-w-7xl',
    wide: 'max-w-[90rem]',
  } as const;

  return (
    <div className={`mx-auto ${widths[size]} px-4 py-8 sm:px-6 lg:px-8 ${className ?? ''}`}>{children}</div>
  );
}
