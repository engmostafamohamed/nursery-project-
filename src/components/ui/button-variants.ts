import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'btn-gradient text-primary-foreground shadow-md hover:opacity-90',
        secondary: 'bg-surface-high text-foreground hover:bg-surface-highest',
        tertiary: 'text-primary hover:bg-surface-high/50',
        destructive: 'bg-error text-white hover:opacity-90',
        outline: 'border border-border bg-transparent hover:bg-surface-high',
        ghost: 'hover:bg-surface-high',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
