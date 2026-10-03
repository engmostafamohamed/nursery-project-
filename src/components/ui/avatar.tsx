import * as React from 'react';

import { cn } from '@/lib/utils';

export function Avatar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-container',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function AvatarImage({
  className,
  loading = 'lazy',
  decoding = 'async',
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img className={cn('h-full w-full object-cover', className)} loading={loading} decoding={decoding} {...props} />;
}

export function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex h-full w-full items-center justify-center text-sm font-semibold text-on-surface', className)}
      {...props}
    />
  );
}
