import { NavLink } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

export type SectionTab = {
  to: string;
  label: string;
  icon?: string;
  /** Selected only on this exact address (for the section's first page). */
  end?: boolean;
};

/**
 * The pages of one section as tabs, each with its own address (so a link, a reload or Back lands on
 * it). Put the same tabs at the top of every page of the section.
 */
export function SectionTabs({ tabs, label, className }: { tabs: SectionTab[]; label: string; className?: string }) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={label} className={cn('max-w-full overflow-x-auto', className)} data-testid="section-tabs">
      <ul className="inline-flex h-11 items-center gap-1 rounded-full border border-outline-variant bg-surface p-1 shadow-sm">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors',
                  isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface',
                )
              }
            >
              {tab.icon ? <MaterialSymbol name={tab.icon} size="text-base" /> : null}
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
