import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

const PHOTO = 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=1400&q=80';
const FEATURES = [
  { icon: 'how_to_reg', key: 'One' },
  { icon: 'forum', key: 'Two' },
  { icon: 'receipt_long', key: 'Three' },
] as const;

/**
 * The sign-in page's other half on wide screens: a photo, what the app is for, and three things it
 * does, all within the screen's height. Without the photo (offline) the brand colour stands in.
 */
export function SignInHero() {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState(true);
  return (
    <aside className="sticky top-0 hidden h-screen p-4 lg:block" aria-hidden>
      <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-primary p-10 text-white xl:p-12">
        {photo ? (
          <img src={PHOTO} alt="" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setPhoto(false)} />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-primary/40" />

        <span className="relative inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur">
          <MaterialSymbol name="verified" size="text-base" />
          {t('auth.page.heroBadge')}
        </span>

        <div className="relative space-y-6">
          <div className="max-w-lg space-y-3">
            <h2 className="font-headline text-4xl font-extrabold leading-tight xl:text-5xl">{t('auth.rightHeadline')}</h2>
            <p className="text-base text-white/85">{t('auth.page.heroBody')}</p>
          </div>
          <ul className="grid gap-3 xl:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.key} className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
                <MaterialSymbol name={f.icon} size="text-2xl" className="text-white" />
                <p className="mt-2 text-sm font-semibold">{t(`auth.feature${f.key}Title`)}</p>
                <p className="mt-0.5 text-xs leading-5 text-white/75">{t(`auth.feature${f.key}Description`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
