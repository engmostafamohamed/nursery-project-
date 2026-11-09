import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { nameLines, nameText, type NameLines } from '@/lib/bilingualName';

export type BilingualNames = {
  /** The reader's language first, the other under it when the nursery shows both. */
  lines: (ar: string | null | undefined, en: string | null | undefined) => NameLines;
  /** One line, for sorting, searching and titles. */
  text: (ar: string | null | undefined, en: string | null | undefined) => string;
};

/** Arabic/English names shown the way the nursery chose, in the reader's language order. */
export function useBilingualNames(nurseryId: string | null | undefined): BilingualNames {
  const { i18n } = useTranslation();
  const arabicFirst = i18n.language.startsWith('ar');
  const { data: pref = 'both' } = useNurseryLanguagePref(nurseryId);
  return useMemo(
    () => ({
      lines: (ar, en) => nameLines(ar, en, pref, arabicFirst),
      text: (ar, en) => nameText(ar, en, pref),
    }),
    [pref, arabicFirst],
  );
}
