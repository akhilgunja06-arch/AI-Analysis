import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, MailCheck, MailX } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useResendEmailOtp, useVerifyEmailOtp } from '@/hooks/queries';

/**
 * Six-digit code entry, shown alongside the link flow.
 *
 * Both paths verify the same account: the link carries a long token, the code is
 * a short-lived six-digit number mailed to the same address. The code is never
 * displayed here — it only travels from the email to this form.
 */
function OtpPanel({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const verify = useVerifyEmailOtp();
  const resend = useResendEmailOtp();
  const toast = useToast();
  const navigate = useNavigate();
  const { isAuthenticated, refresh } = useAuth();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    try {
      await verify.mutateAsync({ email: email.trim(), code });
      if (isAuthenticated) await refresh();
      toast.success('Email verified', 'Your account is now fully active.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That code could not be verified.');
    }
  };

  const onResend = async () => {
    setError(null);
    setMessage(null);
    try {
      const res = await resend.mutateAsync(email.trim());
      setCooldown(res.data.resendAfterSeconds ?? 60);
      setMessage('A new code is on its way. Check your inbox and spam folder.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not send another code.');
    }
  };

  return (
    <div className="mt-5 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Or enter the code from your email</h2>
      </div>

      <form onSubmit={onSubmit} className="mt-3 space-y-3" noValidate>
        <div>
          <label htmlFor="otp-email" className="ss-label">
            Email address
          </label>
          <input
            id="otp-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="ss-input"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="otp-code" className="ss-label">
            Six-digit code
          </label>
          <input
            id="otp-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="ss-input font-mono text-lg tracking-[0.4em]"
            placeholder="000000"
            aria-describedby="otp-hint"
          />
          <p id="otp-hint" className="mt-1 text-xs ss-subtle">
            The code expires five minutes after it is sent and works once.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={verify.isPending} disabled={code.length !== 6}>
            Verify code
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void onResend()}
            loading={resend.isPending}
            disabled={cooldown > 0 || !email.trim()}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </Button>
        </div>
      </form>
    </div>
  );
}

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
  const emailFromQuery = params.get('email') ?? '';
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
        <OtpPanel initialEmail={emailFromQuery} />
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
        <OtpPanel initialEmail={emailFromQuery} />
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
