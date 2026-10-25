import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, LogIn } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { TextField, FormError, CheckboxField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address.').email('That does not look like an email address.'),
  password: z.string().min(1, 'Enter your password.'),
  remember: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: true },
  });

  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const user = await signIn(values.email, values.password);
      toast.success('Signed in', `Welcome back, ${user.username}.`);
      navigate(from ?? '/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 403) {
          // Suspended or deactivated accounts get a specific explanation.
          setFormError(error.message);
        } else if (error.isRateLimited) {
          setFormError('Too many attempts. Please wait a minute and try again.');
        } else if (error.isValidation) {
          for (const issue of error.issues) {
            if (issue.path === 'email' || issue.path === 'password') {
              setError(issue.path as 'email' | 'password', { message: issue.message });
            }
          }
          setFormError(error.issues.length === 0 ? error.message : null);
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('We could not sign you in. Please try again.');
      }
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your matches, sessions and messages."
      footer={
        <>
          New to SkillSpring?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
            Create an account
          </Link>
        </>
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
          {...register('email')}
        />

        <TextField
          label="Password"
          reveal
          autoComplete="current-password"
          placeholder="Your password"
          required
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between gap-4">
          <CheckboxField label="Keep me signed in" {...register('remember')} />
          <Link
            to="/forgot-password"
            className="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          fullWidth
          loading={isSubmitting}
          leftIcon={<LogIn className="h-4 w-4" aria-hidden="true" />}
        >
          Sign in
        </Button>

        <p className="flex items-start gap-2 text-xs ss-subtle">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            By signing in you agree to the{' '}
            <Link to="/terms" className="underline hover:text-[rgb(var(--ss-text))]">
              terms of use
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline hover:text-[rgb(var(--ss-text))]">
              privacy policy
            </Link>
            .
          </span>
        </p>
      </form>
    </AuthShell>
  );
}
