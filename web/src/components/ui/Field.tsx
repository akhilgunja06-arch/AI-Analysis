import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type FieldShellProps = {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

/** Shared label + hint + error scaffolding so every field behaves the same. */
function FieldShell({ label, htmlFor, hint, error, required, children, className }: FieldShellProps) {
  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={htmlFor} className="ss-label">
        {label}
        {required ? (
          <span className="ml-0.5 text-rose-500" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="ss-error-text" id={`${htmlFor}-error`} role="alert">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="ss-hint" id={`${htmlFor}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Renders a show/hide control and manages the input type. */
  reveal?: boolean;
  leftIcon?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, reveal, leftIcon, className, required, type = 'text', ...rest },
  ref,
) {
  const generatedId = useId();
  const id = rest.name ? `${rest.name}-${generatedId}` : generatedId;
  const [visible, setVisible] = useState(false);
  const inputType = reveal ? (visible ? 'text' : 'password') : type;

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--ss-text-subtle))]">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={id}
          type={inputType}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            'ss-input',
            Boolean(leftIcon) && 'pl-10',
            reveal && 'pr-11',
            error && 'ss-input-error',
            className,
          )}
          {...rest}
        />
        {reveal ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[rgb(var(--ss-text-subtle))] transition-colors hover:bg-[rgb(var(--ss-border)/0.6)] hover:text-[rgb(var(--ss-text))]"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        ) : null}
      </div>
    </FieldShell>
  );
});

export type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Shows a live character counter; pair with maxLength. */
  showCount?: boolean;
};

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, showCount, className, required, maxLength, value, ...rest },
  ref,
) {
  const generatedId = useId();
  const id = rest.name ? `${rest.name}-${generatedId}` : generatedId;
  const length = typeof value === 'string' ? value.length : 0;

  return (
    <FieldShell
      label={label}
      htmlFor={id}
      hint={hint}
      error={error}
      required={required}
    >
      <textarea
        ref={ref}
        id={id}
        required={required}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn('ss-input min-h-[110px] resize-y', error && 'ss-input-error', className)}
        {...rest}
      />
      {showCount && maxLength ? (
        <p className="mt-1 text-right text-xs ss-subtle" aria-live="polite">
          {length}/{maxLength}
        </p>
      ) : null}
    </FieldShell>
  );
});

export type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, options, placeholder, className, required, ...rest },
  ref,
) {
  const generatedId = useId();
  const id = rest.name ? `${rest.name}-${generatedId}` : generatedId;

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error} required={required}>
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn('ss-input appearance-none bg-no-repeat pr-9', error && 'ss-input-error', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2394a3b8'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
          backgroundPosition: 'right 0.65rem center',
          backgroundSize: '1.1rem',
        }}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

/** Checkbox with a full-size label target. */
export function CheckboxField({
  label,
  description,
  error,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode; error?: string }) {
  const generatedId = useId();
  const id = rest.name ? `${rest.name}-${generatedId}` : generatedId;

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[rgb(var(--ss-border-strong))] text-brand-600 focus:ring-2 focus:ring-[rgb(var(--ss-ring)/0.35)]"
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs ss-muted">{description}</p> : null}
        {error ? (
          <p className="ss-error-text" id={`${id}-error`} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** On/off switch for settings rows. */
export function ToggleField({
  label,
  description,
  checked,
  onChange,
  disabled,
  name,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description ? <p className="mt-0.5 text-xs ss-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        name={name}
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : 'Toggle setting'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-[rgb(var(--ss-border-strong))]',
        )}
      >
        <span
          className={cn(
            'inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
          style={{ height: '1.125rem', width: '1.125rem' }}
        />
      </button>
    </div>
  );
}

/** Inline validation summary for forms with several fields. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-rose-500/35 bg-rose-50/60 px-3.5 py-3 text-sm text-rose-700 dark:bg-rose-500/5 dark:text-rose-300"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
