import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type FilterMenuOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: string;
};

type FilterMenuProps<T extends string = string> = {
  value: T;
  options: FilterMenuOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  icon?: string;
  className?: string;
};

export function FilterMenu<T extends string = string>({
  value,
  options,
  onChange,
  label,
  icon,
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
            className="h-11 w-full justify-between rounded-lg border-outline-variant bg-surface-container-lowest px-3 text-start font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              {icon ? <span className="material-symbols-outlined text-base text-primary" aria-hidden>{icon}</span> : null}
              <span className="truncate">{buttonLabel}</span>
            </span>
            <span className="material-symbols-outlined ms-2 text-base text-on-surface-variant" aria-hidden>
              expand_more
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl p-2">
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              className="gap-3 rounded-lg px-3 py-2.5"
              onSelect={() => onChange(option.value)}
            >
              <span className="material-symbols-outlined text-base text-primary" aria-hidden>
                {option.icon ?? (option.value === value ? 'check' : 'radio_button_unchecked')}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
