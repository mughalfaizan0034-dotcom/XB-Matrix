import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

// Brand-aligned button variants. Per project_design_system 2026-05-24
// the platform is navy-only — the orange-forward era is retired.
//
//   primary      brand emphasis CTA. The default. Navy fill.
//   secondary    softer navy variant (lighter hover). Use when the
//                primary contrast would be too heavy.
//   accent       alias of primary, kept for back-compat with code that
//                explicitly named accent.
//   outline      neutral bordered button. Common for secondary actions.
//   ghost        transparent until hover. Used in toolbars / menus.
//   destructive  red fill for irreversible actions.
//   link         inline text link.
//
// All emphasis variants consume the semantic `accent` token so a
// future palette pivot only touches tailwind-preset.js.
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-foreground hover:bg-accent-700',
        secondary: 'bg-accent-100 text-accent-900 hover:bg-accent-200',
        accent: 'bg-accent text-accent-foreground hover:bg-accent-700',
        outline: 'border border-border bg-background hover:bg-muted hover:border-accent-300',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-red-700',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-10 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
