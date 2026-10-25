import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/layout/Layouts';
import { Logo } from '@/components/ui/Logo';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="SkillSpring home">
            <Logo size={30} />
          </Link>
        </div>
      </div>
      <PageContainer className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="font-display text-6xl font-extrabold ss-gradient-text">404</p>
          <h1 className="mt-4 font-display text-2xl font-bold">We could not find that page</h1>
          <p className="mx-auto mt-3 max-w-md ss-muted">
            The link may be broken, or the page may have been moved. Try the dashboard or browse the skill
            directory instead.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/">
              <Button leftIcon={<Home className="h-4 w-4" aria-hidden="true" />}>Back to home</Button>
            </Link>
            <Link to="/explore">
              <Button variant="secondary" leftIcon={<Compass className="h-4 w-4" aria-hidden="true" />}>
                Explore skills
              </Button>
            </Link>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
