import { Button, type ButtonProps, buttonVariants } from '@fx/ui';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@fx/ui';

type TypedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function TypedButton({ className, variant, size, children, ...props }: TypedButtonProps) {
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children}
    </button>
  );
}
