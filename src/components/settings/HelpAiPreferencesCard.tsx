import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  isAiAssistantEnabled,
  isHelpPanelEnabled,
  setAiAssistantEnabled,
  setHelpPanelEnabled,
} from '@/lib/helpAiPreferences';

export function HelpAiPreferencesCard() {
  const { t } = useTranslation();
  const [help, setHelp] = useState(() => isHelpPanelEnabled());
  const [ai, setAi] = useState(() => isAiAssistantEnabled());

  const persist = (nextHelp: boolean, nextAi: boolean) => {
    setHelpPanelEnabled(nextHelp);
    setAiAssistantEnabled(nextAi);
    toast.success(t('helpAiPage.saved'));
  };

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <h2 className="text-base font-semibold text-on-surface">{t('helpAiPage.title')}</h2>
      <p className="mt-1 text-xs text-on-surface-variant">{t('helpAiPage.subtitle')}</p>
      <p className="mt-3 text-xs text-on-surface-variant">{t('helpAiPage.privacy')}</p>
      <div className="mt-4 space-y-4">
        <div className="flex min-h-11 items-start gap-3">
          <Checkbox
            id="xo-pref-help"
            checked={help}
            onCheckedChange={(v) => {
              const next = v === true;
              setHelp(next);
              persist(next, ai);
            }}
            className="mt-1"
          />
          <Label htmlFor="xo-pref-help" className="cursor-pointer text-sm font-normal leading-snug">
            {t('helpAiPage.helpPanel')}
          </Label>
        </div>
        <div className="flex min-h-11 items-start gap-3">
          <Checkbox
            id="xo-pref-ai"
            checked={ai}
            onCheckedChange={(v) => {
              const next = v === true;
              setAi(next);
              persist(help, next);
            }}
            className="mt-1"
          />
          <Label htmlFor="xo-pref-ai" className="cursor-pointer text-sm font-normal leading-snug">
            {t('helpAiPage.aiAssistant')}
          </Label>
        </div>
      </div>
    </section>
  );
}
