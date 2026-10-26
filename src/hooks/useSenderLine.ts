import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { senderLine } from '@/lib/familyMessageLabels';
import { senderParts, type SenderFields } from '@/lib/familyMessages';

/** Who sent a message (or a daily report) to families, as one line in the reader's language (see senderLine). */
export function useSenderLine() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return useCallback((sender: SenderFields) => senderLine(t, senderParts(sender, lang)), [t, lang]);
}
