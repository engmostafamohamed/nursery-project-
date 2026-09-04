import { Check, Moon, Palette, Sprout, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const THEMES = [
  { value: 'light', label: 'Light', desc: 'Bright workspace', icon: Sun },
  { value: 'dark', label: 'Dark', desc: 'Low-light workspace', icon: Moon },
  { value: 'soft', label: 'Soft', desc: 'Warm light workspace', icon: Sprout },
] as const;

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const CurrentIcon = THEMES.find((item) => item.value === theme)?.icon ?? Palette;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative h-11 w-11 rounded-full border border-outline-variant bg-surface text-on-surface hover:bg-surface-container',
            className,
          )}
        >
          <CurrentIcon className="h-4 w-4" />
          <span className="sr-only">Switch theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl border-outline-variant bg-surface p-1.5 shadow-lg">
        {THEMES.map((t) => {
          const Icon = t.icon;
          const selected = theme === t.value;
          return (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={cn(
              'gap-3 rounded-lg px-3 py-2.5',
              selected ? 'bg-primary/10 text-primary' : 'text-on-surface',
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{t.label}</span>
              <span className="block text-xs text-on-surface-variant">{t.desc}</span>
            </span>
            {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
          </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

