import type { TFunction } from 'i18next';

import type { SenderParts } from './familyMessages';

// The words for who sent a message to families: role, department and place in a class.

export function senderRoleName(t: TFunction, role: SenderParts['role']): string {
  switch (role) {
    case 'teacher':
      return t('familyMessages.senderRole.teacher');
    case 'manager':
      return t('familyMessages.senderRole.manager');
    case 'branch_admin':
      return t('familyMessages.senderRole.branch_admin');
    case 'chain_super_admin':
      return t('familyMessages.senderRole.chain_super_admin');
    default:
      return t('familyMessages.senderRole.xo_super_admin');
  }
}

export function senderDepartmentName(t: TFunction, department: SenderParts['department']): string | null {
  if (department === 'finance') return t('familyMessages.department.finance');
  if (department === 'hr') return t('familyMessages.department.hr');
  if (department === 'operations') return t('familyMessages.department.operations');
  return null;
}

export function senderPlaceName(t: TFunction, place: SenderParts['place']): string | null {
  if (place === 'lead') return t('familyMessages.place.lead');
  if (place === 'assistant') return t('familyMessages.place.assistant');
  if (place === 'substitute') return t('familyMessages.place.substitute');
  return null;
}

/**
 * Who sent a message, as one line: the title the nursery gave them (else their role), their
 * department, and their place in their classes. "Head of teachers · Lead teacher, Butterflies".
 */
export function senderLine(t: TFunction, parts: SenderParts): string {
  const place = senderPlaceName(t, parts.place);
  return [
    parts.title || senderRoleName(t, parts.role),
    senderDepartmentName(t, parts.department),
    parts.classes ? (place ? `${place}, ${parts.classes}` : parts.classes) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
