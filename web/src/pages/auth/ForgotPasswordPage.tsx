import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, MailQuestion, Send } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { FormError, TextField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address.').email('That does not look like an email address.'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Request a password reset.
 *
 * The response is identical whether or not the address exists, so this page
 * cannot be used to discover which emails have accounts.
 */
export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const res = await api.post<{ message: string; devResetToken?: string }>('/auth/forgot-password', {
        email: values.email,
      });
      setDevToken(res.data.devResetToken ?? null);
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError && error.isRateLimited) {
        setFormError('Too many reset requests. Please wait a few minutes and try again.');
      } else {
        setFormError(error instanceof Error ? error.message : 'We could not process that request.');
      }
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="If an account exists for that address, a reset link is on its way."
        footer={
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/35 bg-emerald-50/60 p-4 dark:bg-emerald-500/5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium">Request received</p>
            <p className="mt-1 ss-muted">
              The link expires in one hour and can only be used once. If it does not arrive, check your spam
              folder before requesting another.
            </p>
          </div>
        </div>

        {devToken ? (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50/60 p-4 text-sm dark:bg-amber-500/5">
            <p className="font-semibold">Email delivery is disabled on this deployment</p>
            <p className="mt-1 ss-muted">
              Rather than pretend the email was sent, here is the token so you can continue:
            </p>
            <Link
              to={`/reset-password?token=${devToken}`}
              className="mt-2 block break-all font-mono text-xs text-brand-600 underline dark:text-brand-300"
            >
              /reset-password?token={devToken}
            </Link>
          </div>
        ) : null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email address on your account and we will send a reset link."
      footer={
        <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? <FormError message={formError} /> : null}

        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          error={errors.email?.message}
          leftIcon={<MailQuestion className="h-4 w-4" aria-hidden="true" />}
          {...register('email')}
        />

        <Button type="submit" fullWidth loading={isSubmitting} leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
