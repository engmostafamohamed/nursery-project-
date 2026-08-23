import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getUserDisplayName } from '@/lib/chat';
import { cn } from '@/lib/utils';
import type { ChatParticipant, ChatParticipantRole } from '@/types/chat';

interface ChatRecipientPickerProps {
  participants: ChatParticipant[];
  languagePref: 'ar' | 'en' | 'both';
  onSelect: (participant: ChatParticipant) => void;
  onClose: () => void;
}

const ROLE_ORDER: ChatParticipantRole[] = [
  'branch_admin',
  'chain_super_admin',
  'manager',
  'teacher',
  'parent',
];

export function ChatRecipientPicker({
  participants,
  languagePref,
  onSelect,
  onClose,
}: ChatRecipientPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<ChatParticipantRole | 'all'>('all');

  const availableRoles = useMemo(() => {
    const present = new Set(participants.map((p) => p.role));
    return ROLE_ORDER.filter((r) => present.has(r));
  }, [participants]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return participants
      .filter((p) => roleFilter === 'all' || p.role === roleFilter)
      .filter((p) => {
        if (!term) return true;
        return (
          p.name_ar.toLowerCase().includes(term) ||
          p.name_en.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const ra = ROLE_ORDER.indexOf(a.role);
        const rb = ROLE_ORDER.indexOf(b.role);
        if (ra !== rb) return ra - rb;
        return getUserDisplayName(a.name_en, a.name_en, 'en').localeCompare(
          getUserDisplayName(b.name_en, b.name_en, 'en'),
        );
      });
  }, [participants, roleFilter, search]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-surface-container-lowest">
      <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="-ms-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-high"
          aria-label={t('common.close')}
        >
          <span className="material-symbols-outlined text-base" aria-hidden>
            arrow_back
          </span>
        </button>
        <h2 className="flex-1 text-base font-semibold text-on-surface">
          {t('chat.newMessageTitle')}
        </h2>
      </div>

      <div className="space-y-3 border-b border-outline-variant px-4 py-3">
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute start-3 top-2 text-sm text-on-surface-variant">
            search
          </span>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('chat.directorySearchPlaceholder')}
            className="h-9 w-full rounded-xl border border-outline-variant bg-surface ps-9 pe-3 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {availableRoles.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            <RoleChip
              label={t('chat.filterAll')}
              active={roleFilter === 'all'}
              onClick={() => setRoleFilter('all')}
            />
            {availableRoles.map((r) => (
              <RoleChip
                key={r}
                label={t(`chat.role.${r}`)}
                active={roleFilter === r}
                onClick={() => setRoleFilter(r)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-on-surface-variant">
            {t('chat.noDirectory')}
          </div>
        ) : (
          filtered.map((p) => {
            const name = getUserDisplayName(p.name_ar, p.name_en, languagePref);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-container-low"
              >
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-on-surface">{name}</p>
                  <p className="text-xs text-on-surface-variant">{t(`chat.role.${p.role}`)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function RoleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-white'
          : 'bg-surface-container text-on-surface-variant hover:bg-surface-high',
      )}
    >
      {label}
    </button>
  );
}
