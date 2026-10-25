import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { FormError, TextField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';

const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .regex(/[a-z]/, 'Include at least one lower-case letter.')
      .regex(/[A-Z]/, 'Include at least one upper-case letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match.',
  });

type FormValues = z.infer<typeof schema>;

/**
 * Complete a password reset. Every existing session is revoked server-side, so
 * the member signs in again afterwards with the new password.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' } });

  if (!token) {
    return (
      <AuthShell title="Reset link required">
        <EmptyState
          icon={<KeyRound className="h-7 w-7" aria-hidden="true" />}
          title="This page needs a reset link"
          description="Open the link from your reset email, or request a new one."
          action={
            <Link to="/forgot-password">
              <Button>Request a new link</Button>
            </Link>
          }
        />
      </AuthShell>
    );
  }

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      await api.post('/auth/reset-password', { token, password: values.password });
      toast.success('Password updated', 'Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setFormError('That reset link is invalid or has expired. Please request a new one.');
      } else {
        setFormError(error instanceof Error ? error.message : 'We could not reset your password.');
      }
    }
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Setting a new password signs out every other device."
      footer={
        <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? (
          <>
            <FormError message={formError} />
            <Link to="/forgot-password" className="block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
              Request a new reset link
            </Link>
          </>
        ) : null}

        <TextField
          label="New password"
          reveal
          autoComplete="new-password"
          placeholder="Choose a strong password"
          required
          error={errors.password?.message}
          hint="At least 10 characters, with upper and lower case and a number."
          {...register('password')}
        />

        <TextField
          label="Confirm new password"
          reveal
          autoComplete="new-password"
          placeholder="Repeat the new password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" fullWidth loading={isSubmitting} leftIcon={<KeyRound className="h-4 w-4" aria-hidden="true" />}>
          Set new password
        </Button>
      </form>
    </AuthShell>
  );
}
