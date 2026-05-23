import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

// Brand-aligned button variants (project_design_system orange-emphasis):
//   primary    brand orange CTA. The default. Use for operator actions
//              that are the primary call to action on a surface.
//   secondary  deep navy fill. Use sparingly for surfaces where orange
//              would compete with content (e.g. dark headers, the
//              workspace picker landing). Most pages should not need it.
//   accent     alias of primary (back-compat with explicit accent= calls).
//   outline    neutral bordered button. Common for secondary actions.
//   ghost      transparent until hover. Used in toolbars / menus.
//   destructive  red fill for irreversible actions.
//   link       inline text link.
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-orange text-white hover:bg-orange-600',
        secondary: 'bg-navy text-white hover:bg-navy-700',
        accent: 'bg-orange text-white hover:bg-orange-600',
        outline: 'border border-border bg-background hover:bg-muted hover:border-orange-300',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-red-700',
        link: 'text-orange underline-offset-4 hover:underline',
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
