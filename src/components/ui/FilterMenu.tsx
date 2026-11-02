import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type FilterMenuOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: string;
  disabled?: boolean;
};

type FilterMenuProps<T extends string = string> = {
  value: T;
  options: FilterMenuOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  icon?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * A dropdown built on DropdownMenu, for choices that need icons. It looks like every native Select
 * in the app (see the `select` rules in index.css): a boxed field with the expand_more arrow, and
 * a menu as wide as the field where the chosen row is tinted with a check at its end.
 */
export function FilterMenu<T extends string = string>({
  value,
  options,
  onChange,
  label,
  icon,
  disabled,
  className,
}: FilterMenuProps<T>) {
  const selected = options.find((option) => option.value === value) ?? options[0];
  const buttonLabel = selected?.label ?? label ?? '';

  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      {label ? <p className="text-xs font-semibold text-on-surface-variant">{label}</p> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-12 w-full justify-between rounded-lg border-outline-variant bg-surface-container-lowest px-3 text-start font-normal shadow-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              {icon ? <span className="material-symbols-outlined text-base text-primary" aria-hidden>{icon}</span> : null}
              <span className="truncate">{buttonLabel}</span>
            </span>
            <span className="material-symbols-outlined ms-2 text-xl text-on-surface-variant" aria-hidden>
              expand_more
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {options.map((option) => {
            const chosen = option.value === value;
            return (
              <DropdownMenuItem
                key={option.value}
                disabled={option.disabled}
                className={cn('gap-2', chosen && 'bg-primary/5 font-medium text-primary')}
                onSelect={() => onChange(option.value)}
              >
                {option.icon ? (
                  <span className="material-symbols-outlined text-base text-primary" aria-hidden>
                    {option.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {chosen ? (
                  <span className="material-symbols-outlined text-base" aria-hidden>
                    check
                  </span>
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
