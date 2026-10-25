import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailWarning, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/providers/AuthProvider';

/**
 * A persistent, dismissible reminder that the account is unverified.
 *
 * Verification gates requests, messaging and community posting, so the banner
 * states exactly what is blocked rather than just warning in the abstract.
 */
export function EmailVerificationBanner() {
  const { user, isVerified } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const toast = useToast();

  if (!user || isVerified || dismissed) return null;

  const resend = async () => {
    setSending(true);
    try {
      const res = await api.post<{ message: string; devVerificationToken?: string }>(
        '/auth/resend-verification',
      );
      toast.success('Verification email sent', `Check the inbox for ${user.email}.`);
      if (res.data.devVerificationToken) {
        // Local development has no mail provider, so the token is surfaced.
        toast.info('Development mode', `Verification token: ${res.data.devVerificationToken}`);
      }
    } catch (error) {
      toast.error('Could not send the email', error instanceof Error ? error.message : undefined);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b border-amber-500/35 bg-amber-50 dark:bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">Your email address is not verified yet.</p>
          <p className="mt-0.5 ss-muted">
            You can browse and build your profile now, but sending exchange requests, messaging and posting in
            the community need a verified address.{' '}
            <Link to="/settings" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              Manage in settings
            </Link>
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={sending} onClick={resend} leftIcon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}>
          Resend
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss verification reminder"
          className="rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
