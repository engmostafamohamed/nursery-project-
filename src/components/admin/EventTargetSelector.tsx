type ClassRow = { id: string; name_ar: string; name_en: string };
type ChildRow = {
  id: string;
  class_id: string | null;
  full_name_ar: string;
  full_name_en: string;
};

interface EventTargetSelectorProps {
  audienceMode: 'all' | 'specific';
  specificMode: 'classes' | 'children';
  selectedClassIds: string[];
  selectedChildIds: string[];
  classes: ClassRow[];
  children: ChildRow[];
  languagePref: 'ar' | 'en' | 'both';
  t: (key: string) => string;
  onAudienceModeChange: (value: 'all' | 'specific') => void;
  onSpecificModeChange: (value: 'classes' | 'children') => void;
  onToggleClass: (id: string, checked: boolean) => void;
  onToggleChild: (id: string, checked: boolean) => void;
}

function localizedName(
  item: ClassRow | ChildRow,
  languagePref: 'ar' | 'en' | 'both',
) {
  if ('name_ar' in item) {
    if (languagePref === 'ar') return item.name_ar;
    if (languagePref === 'en') return item.name_en;
    return `${item.name_ar} / ${item.name_en}`;
  }
  if (languagePref === 'ar') return item.full_name_ar;
  if (languagePref === 'en') return item.full_name_en;
  return `${item.full_name_ar} / ${item.full_name_en}`;
}

export function EventTargetSelector({
  audienceMode,
  specificMode,
  selectedClassIds,
  selectedChildIds,
  classes,
  children,
  languagePref,
  t,
  onAudienceModeChange,
  onSpecificModeChange,
  onToggleClass,
  onToggleChild,
}: EventTargetSelectorProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium text-on-surface">{t('admin.events.audience')}</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={audienceMode === 'all'} onChange={() => onAudienceModeChange('all')} />
            {t('admin.events.allChildren')}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={audienceMode === 'specific'} onChange={() => onAudienceModeChange('specific')} />
            {t('admin.events.specificGroups')}
          </label>
        </div>
      </div>

      {audienceMode === 'specific' ? (
        <div className="space-y-3 rounded-xl border border-outline-variant p-3">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={specificMode === 'classes'} onChange={() => onSpecificModeChange('classes')} />
              {t('admin.events.byClasses')}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={specificMode === 'children'} onChange={() => onSpecificModeChange('children')} />
              {t('admin.events.byChildren')}
            </label>
          </div>

          <div className="grid gap-2">
            {(specificMode === 'classes' ? classes : children).map((item) => {
              const selected =
                specificMode === 'classes'
                  ? selectedClassIds.includes(item.id)
                  : selectedChildIds.includes(item.id);
              return (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      if (specificMode === 'classes') onToggleClass(item.id, e.target.checked);
                      else onToggleChild(item.id, e.target.checked);
                    }}
                  />
                  {localizedName(item, languagePref)}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
