import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { senderLine } from '@/lib/familyMessageLabels';
import { senderParts, type ParentFamilyMessage } from '@/lib/familyMessages';

/** Who sent a message to families, as one line in the reader's language (see senderLine). */
export function useSenderLine() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return useCallback((message: ParentFamilyMessage) => senderLine(t, senderParts(message, lang)), [t, lang]);
}
