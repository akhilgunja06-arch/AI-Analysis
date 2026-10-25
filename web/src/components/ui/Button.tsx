import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

const VARIANTS: Record<Variant, string> = {
  primary: 'ss-btn-primary',
  secondary: 'ss-btn-secondary',
  ghost: 'ss-btn-ghost',
  danger: 'ss-btn-danger',
  success: 'ss-btn bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.985]',
};

const SIZES: Record<Size, string> = {
  sm: 'ss-btn-sm',
  md: '',
  lg: 'ss-btn-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'secondary';
  size?: 'sm' | 'md';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors duration-150',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        variant === 'ghost'
          ? 'text-[rgb(var(--ss-text-muted))] hover:bg-[rgb(var(--ss-border)/0.6)] hover:text-[rgb(var(--ss-text))]'
          : 'border bg-[rgb(var(--ss-bg-alt))] hover:border-[rgb(var(--ss-ring))]',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
