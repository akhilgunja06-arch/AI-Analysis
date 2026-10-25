import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailCheck, MailX } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/Feedback';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

type State = 'verifying' | 'success' | 'failed' | 'missing';

/**
 * Email verification landing page.
 *
 * The token is exchanged for a verified status exactly once. The guard against
 * React's double-invoked effects in development is deliberate: without it the
 * second call would consume an already-spent token and show a false failure.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const { isAuthenticated, refresh } = useAuth();
  const [state, setState] = useState<State>(token ? 'verifying' : 'missing');
  const [message, setMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        await api.post('/auth/verify-email', { token });
        setState('success');
        if (isAuthenticated) await refresh();
      } catch (error) {
        setState('failed');
        setMessage(
          error instanceof ApiError
            ? error.message
            : 'That verification link is invalid or has expired.',
        );
      }
    })();
  }, [token, isAuthenticated, refresh]);

  if (state === 'verifying') {
    return (
      <AuthShell title="Verifying your email">
        <LoadingState label="Checking the verification link" />
      </AuthShell>
    );
  }

  if (state === 'missing') {
    return (
      <AuthShell
        title="Verification link needed"
        subtitle="Open the link from the verification email we sent you."
        footer={
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-50/60 p-4 text-sm dark:bg-amber-500/5">
          <MailX className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div>
            <p className="font-medium">No token in this link</p>
            <p className="mt-1 ss-muted">
              If you are already signed in you can resend the verification email from your settings page.
            </p>
          </div>
        </div>
        <Link to="/settings" className="mt-4 block">
          <Button variant="secondary" fullWidth>
            Go to settings
          </Button>
        </Link>
      </AuthShell>
    );
  }

  if (state === 'failed') {
    return (
      <AuthShell
        title="We could not verify that link"
        subtitle="Verification links expire after 24 hours and can only be used once."
        footer={
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/35 bg-rose-50/60 p-4 text-sm dark:bg-rose-500/5">
          <MailX className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <div>
            <p className="font-medium">{message}</p>
            <p className="mt-1 ss-muted">
              Request a fresh link from your settings page while signed in.
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to="/settings" className="flex-1">
            <Button variant="secondary" fullWidth>
              Go to settings
            </Button>
          </Link>
          <Link to="/login" className="flex-1">
            <Button fullWidth>Sign in</Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Email verified"
      subtitle="Your account is fully active. Everything is unlocked."
      footer={
        <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Back to sign in
        </Link>
      }
    >
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/35 bg-emerald-50/60 p-4 text-sm dark:bg-emerald-500/5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <div>
          <p className="font-medium">Thanks for confirming</p>
          <p className="mt-1 ss-muted">
            You can now send exchange requests, message members and post in the community.
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        {isAuthenticated ? (
          <Button fullWidth onClick={() => navigate('/dashboard')} leftIcon={<MailCheck className="h-4 w-4" aria-hidden="true" />}>
            Go to dashboard
          </Button>
        ) : (
          <Link to="/login" className="w-full">
            <Button fullWidth>Sign in</Button>
          </Link>
        )}
      </div>
    </AuthShell>
  );
}
