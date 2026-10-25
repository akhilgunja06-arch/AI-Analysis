import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, UserPlus, X } from 'lucide-react';
import { AuthShell } from './AuthShell';
import { CheckboxField, FormError, TextField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Registration.
 *
 * The password rules shown in the interface are the same rules the server
 * enforces, so nothing is rejected after the fact for a reason the member could
 * not have known about.
 */
const schema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Tell us what to call you.')
      .max(80, 'That name is a little too long.'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Usernames are at least 3 characters.')
      .max(30, 'Usernames are at most 30 characters.')
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use letters, numbers, hyphens and underscores only.'),
    email: z.string().trim().min(1, 'Enter your email address.').email('That does not look like an email address.'),
    password: z
      .string()
      .min(10, 'Use at least 10 characters.')
      .max(128, 'That password is too long.')
      .regex(/[a-z]/, 'Include at least one lower-case letter.')
      .regex(/[A-Z]/, 'Include at least one upper-case letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, {
      errorMap: () => ({ message: 'You need to accept the terms to create an account.' }),
    }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match.',
  });

type FormValues = z.infer<typeof schema>;

const RULES = [
  { label: 'At least 10 characters', test: (v: string) => v.length >= 10 },
  { label: 'One lower-case letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'One upper-case letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v: string) => /[0-9]/.test(v) },
];

export default function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false as unknown as true,
    },
  });

  const password = watch('password') ?? '';
  const passed = useMemo(() => RULES.map((rule) => rule.test(password)), [password]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    try {
      const result = await registerAccount({
        email: values.email,
        username: values.username,
        password: values.password,
        displayName: values.displayName,
        acceptedTerms: true,
      });

      toast.success('Account created', 'Add your skills next so we can find your matches.');

      if (result.devVerificationToken) {
        // No mail provider in local development, so the token is shown instead
        // of being silently lost.
        toast.info(
          'Development mode',
          'Email delivery is disabled here. The verification token was written to the server log.',
        );
      }

      navigate('/onboarding', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.isConflict) {
          const fields = (error.details as { fields?: string[] } | undefined)?.fields ?? [];
          if (fields.includes('email')) {
            setError('email', { message: 'An account with that email address already exists.' });
          }
          if (fields.includes('username')) {
            setError('username', { message: 'That username is taken. Try another.' });
          }
          if (fields.length === 0) setFormError(error.message);
        } else if (error.isValidation) {
          const known: (keyof FormValues)[] = [
            'displayName',
            'username',
            'email',
            'password',
            'confirmPassword',
            'acceptedTerms',
          ];
          for (const issue of error.issues) {
            const path = issue.path as keyof FormValues;
            if (known.includes(path)) {
              setError(path, { message: issue.message });
            }
          }
          setFormError(error.issues.length === 0 ? error.message : null);
        } else if (error.isRateLimited) {
          setFormError('Too many sign-up attempts from here. Please try again shortly.');
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('We could not create your account. Please try again.');
      }
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes a minute. You will add your skills straight afterwards."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {formError ? <FormError message={formError} /> : null}

        <TextField
          label="Display name"
          autoComplete="name"
          placeholder="How you want to appear to others"
          required
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <TextField
          label="Username"
          autoComplete="username"
          placeholder="e.g. amara-o"
          required
          error={errors.username?.message}
          hint="Your public profile lives at /members/your-username. Letters, numbers, hyphens and underscores."
          {...register('username')}
        />

        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          error={errors.email?.message}
          hint="Never shown on your public profile. Used to sign in and to verify the account."
          {...register('email')}
        />

        <div>
          <TextField
            label="Password"
            reveal
            autoComplete="new-password"
            placeholder="Choose a strong password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
          {password.length > 0 ? (
            <ul className="mt-2 grid grid-cols-1 gap-1 xs:grid-cols-2" aria-live="polite">
              {RULES.map((rule, index) => (
                <li
                  key={rule.label}
                  className={cn('flex items-center gap-1.5 text-xs', passed[index] ? 'text-emerald-600 dark:text-emerald-400' : 'ss-subtle')}
                >
                  {passed[index] ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {rule.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <TextField
          label="Confirm password"
          reveal
          autoComplete="new-password"
          placeholder="Repeat your password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <CheckboxField
          label={
            <>
              I agree to the{' '}
              <Link to="/terms" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                terms of use
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                privacy policy
              </Link>
              .
            </>
          }
          error={errors.acceptedTerms?.message}
          {...register('acceptedTerms')}
        />

        <Button
          type="submit"
          fullWidth
          loading={isSubmitting}
          leftIcon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
        >
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
