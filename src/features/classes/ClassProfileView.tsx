import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBilingualNames } from '@/hooks/useBilingualNames';
import { useSearchParam } from '@/hooks/useSearchParam';
import { adminLinks } from '@/lib/adminLinks';

import { ClassActivityPanel } from './ClassActivityPanel';
import { ClassChildrenPanel } from './ClassChildrenPanel';
import { ClassDetailsPanel } from './ClassDetailsPanel';
import { ClassProfileHero } from './ClassProfileHero';
import { tabFrom, todaySummary, type ChildFilter, type ClassProfile, type ClassProfileTab } from './classProfile';
import { ClassTeamPanel } from './ClassTeamPanel';
import { ClassTodayTiles } from './ClassTodayTiles';
import { ClassWaitlistPanel } from './ClassWaitlistPanel';
import { useClassFormat } from './useClassFormat';

/**
 * Everything about one class on one page: the header with today's numbers, then its children, team
 * (who works with it today), activity, waiting list and details in tabs. The open tab is kept in the address (?tab=team), so
 * a link, a reload or Back lands on it.
 */
export function ClassProfileView({ profile, base }: { profile: ClassProfile; base: string }) {
  const { t } = useTranslation();
  const names = useBilingualNames(profile.info.nurseryId);
  const format = useClassFormat(profile);
  const [tabParam, setTabParam] = useSearchParam('tab', 'children');
  const tab = tabFrom(tabParam);
  const [childFilter, setChildFilter] = useState<ChildFilter>('all');
  const summary = useMemo(() => todaySummary(profile.children), [profile.children]);

  const openTab = (next: ClassProfileTab) => setTabParam(next);
  // A number in the header opens the children it counts.
  const showChildren = (filter: ChildFilter) => {
    setChildFilter(filter);
    openTab('children');
  };

  const tabs: Array<{ id: ClassProfileTab; icon: string; label: string; count?: number }> = [
    { id: 'children', icon: 'child_care', label: t('classProfile.tabs.children'), count: profile.children.length },
    { id: 'team', icon: 'groups', label: t('classProfile.tabs.team'), count: profile.team.length },
    { id: 'activity', icon: 'forum', label: t('classProfile.tabs.activity') },
    { id: 'waitlist', icon: 'hourglass_top', label: t('classProfile.tabs.waitlist'), count: profile.waitlist.length },
    { id: 'details', icon: 'info', label: t('classProfile.tabs.details') },
  ];
  const panel = { profile, names, format, base };

  return (
    <div className="space-y-5 pb-8" data-testid="class-profile">
      <Link
        to={adminLinks(base).classes}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <MaterialSymbol name="arrow_back" size="text-lg" className="rtl:rotate-180" />
        {t('classProfile.backToClasses')}
      </Link>

      <ClassProfileHero profile={profile} names={names} base={base}>
        <ClassTodayTiles summary={summary} active={tab === 'children' ? childFilter : 'all'} onPick={showChildren} />
      </ClassProfileHero>

      <Tabs value={tab} onValueChange={(value) => openTab(tabFrom(value))}>
        <div className="max-w-full overflow-x-auto">
          <TabsList className="h-11">
            {tabs.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="gap-1.5 px-3.5 py-2 text-sm">
                <MaterialSymbol name={item.icon} size="text-base" />
                {item.label}
                {item.count ? (
                  <span className="rounded-full bg-surface-high px-1.5 text-[11px] font-semibold tabular-nums text-on-surface-variant">{item.count}</span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="children" className="mt-4">
          <ClassChildrenPanel {...panel} filter={childFilter} onFilterChange={setChildFilter} />
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          <ClassTeamPanel {...panel} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ClassActivityPanel {...panel} />
        </TabsContent>
        <TabsContent value="waitlist" className="mt-4">
          <ClassWaitlistPanel profile={profile} format={format} base={base} />
        </TabsContent>
        <TabsContent value="details" className="mt-4">
          <ClassDetailsPanel {...panel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
