import { useEffect, useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useSubmitSupportTicket } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';

const SUBJECTS = [
  { value: 'TECHNICAL', label: 'Something is broken' },
  { value: 'ACCOUNT', label: 'My account or profile' },
  { value: 'MODERATION', label: 'Report or moderation' },
  { value: 'PRIVACY', label: 'Privacy or my data' },
  { value: 'FEEDBACK', label: 'Feedback or a suggestion' },
  { value: 'OTHER', label: 'Something else' },
];

/**
 * The support message form.
 *
 * Shared by the help centre and the contact page so both validate and submit
 * through the same code path. The server validates again; this only prevents an
 * obviously incomplete submission.
 */
export function ContactForm({ minMessageLength = 20 }: { minMessageLength?: number }) {
  const toast = useToast();
  const submitTicket = useSubmitSupportTicket();
  const { user, profile } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('TECHNICAL');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  // Prefill from the signed-in account, but never overwrite what the visitor
  // has already typed — the session may resolve after they start writing.
  useEffect(() => {
    if (!user) return;
    setName((current) => current || profile?.displayName || user.username);
    setEmail((current) => current || user.email);
  }, [user, profile]);

  const send = async () => {
    setFormError(null);
    if (name.trim().length < 2) {
      setFormError('Tell us your name so we can reply properly.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFormError('That email address does not look right.');
      return;
    }
    if (message.trim().length < minMessageLength) {
      setFormError(`Please give us at least ${minMessageLength} characters of detail so we can help.`);
      return;
    }
    try {
      const res = await submitTicket.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        subject,
        message: message.trim(),
      });
      setReference(res.data.reference);
      setMessage('');
      toast.success('Message sent', `Your reference is ${res.data.reference}.`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'We could not send that message.');
    }
  };

  if (reference) {
    return (
      <div className="rounded-xl border border-emerald-500/35 bg-emerald-50/60 p-4 text-sm dark:bg-emerald-500/5">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Message received
        </p>
        <p className="mt-1 ss-muted">
          Your reference is <strong className="font-mono">{reference}</strong>. Quote it if you follow up.
        </p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => setReference(null)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/35 bg-rose-50/60 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300"
        >
          {formError}
        </p>
      ) : null}
      <TextField
        label="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={80}
        autoComplete="name"
      />
      <TextField
        label="Email address"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        hint="So we can reply. Not used for anything else."
        autoComplete="email"
      />
      <SelectField
        label="What is this about?"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        options={SUBJECTS}
      />
      <TextAreaField
        label="Message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={2000}
        showCount
        required
        className="min-h-[140px]"
        placeholder="Include what you were doing, what you expected and what happened instead."
      />
      <Button
        fullWidth
        onClick={() => void send()}
        loading={submitTicket.isPending}
        leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
      >
        Send message
      </Button>
    </div>
  );
}
