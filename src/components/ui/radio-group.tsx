import * as React from 'react';

import { cn } from '@/lib/utils';

type RadioGroupContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | undefined>(undefined);

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroup = ({ value, onValueChange, className, children, ...props }: RadioGroupProps) => {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div
        role="radiogroup"
        className={cn('grid gap-2', className)}
        {...props}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
};

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext);

    const checked = ctx?.value === value;

    const handleChange = () => {
      ctx?.onValueChange?.(value);
    };

    return (
      <input
        type="radio"
        ref={ref}
        className={cn(
          'h-4 w-4 cursor-pointer rounded-full border border-outline-variant text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary',
          className,
        )}
        value={value}
        checked={checked}
        onChange={handleChange}
        {...props}
      />
    );
  },
);

RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };

