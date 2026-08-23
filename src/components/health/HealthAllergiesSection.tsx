import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HealthAllergyDialog } from '@/components/health/HealthAllergyDialog';
import type { AllergySeverity, ChildAllergiesRow } from '@/types/tables/child_health';

type Props = {
  items: ChildAllergiesRow[];
  readOnly: boolean;
  onAdd: (patch: Partial<ChildAllergiesRow>) => void;
  onEdit: (id: string, patch: Partial<ChildAllergiesRow>) => void;
  onDelete: (id: string) => void;
  isBusy: boolean;
};

export function HealthAllergiesSection({ items, readOnly, onAdd, onEdit, onDelete, isBusy }: Props) {
  const { t, i18n } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChildAllergiesRow | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const hasLifeThreat = items.some((a) => a.severity === 'life_threatening');

  return (
    <>
      <Card className={hasLifeThreat ? 'border-2 border-error shadow-md' : ''}>
        {hasLifeThreat && (
          <div className="rounded-t-2xl bg-error px-4 py-3 text-on-primary">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-xl" aria-hidden>
                warning
              </span>
              <div>
                <p className="text-base font-semibold">{t('health.allergy.lifeThreateningBanner')}</p>
                <p className="text-sm opacity-95">{t('health.allergy.lifeThreateningBannerHint')}</p>
              </div>
            </div>
          </div>
        )}
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('health.sections.allergies')}</CardTitle>
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
              {t('health.actions.addAllergy')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t('health.empty.allergies')}</p>
          ) : (
            <ul className="space-y-3">
              {items.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-xl border p-3 ${
                    a.severity === 'life_threatening'
                      ? 'border-error bg-error-container'
                      : 'border-outline-variant bg-surface-container-low'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-on-surface">{a.allergen_name}</p>
                      <p className="text-sm text-on-surface-variant">
                        {t('health.fields.reaction')}: {a.reaction_type ?? '—'}
                      </p>
                      <SeverityBadge severity={a.severity} />
                      <p className="mt-1 text-sm">
                        {t('health.fields.treatment')}: {a.treatment_protocol ?? '—'}
                      </p>
                      <p className="text-sm text-on-surface-variant">
                        {t('health.fields.lastReaction')}:{' '}
                        {a.last_reaction_date
                          ? new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB').format(
                              new Date(a.last_reaction_date),
                            )
                          : '—'}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setEditing(a); setDialogOpen(true); }}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmId(a.id)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <HealthAllergyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={(payload) => {
          if (editing) onEdit(editing.id, payload);
          else onAdd(payload);
          setDialogOpen(false);
          setEditing(null);
        }}
        isBusy={isBusy}
      />

      <Dialog open={Boolean(confirmId)} onOpenChange={() => setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('health.confirm.deleteAllergyTitle')}</DialogTitle>
            <DialogDescription>{t('health.confirm.deleteAllergyBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isBusy}
              onClick={() => {
                if (confirmId) onDelete(confirmId);
                setConfirmId(null);
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SeverityBadge({ severity }: { severity: AllergySeverity }) {
  const { t } = useTranslation();
  const cls: Record<AllergySeverity, string> = {
    mild: 'border-outline-variant bg-surface-container text-on-surface',
    moderate: 'border-secondary/40 bg-secondary-fixed text-on-secondary-container',
    severe: 'border-error/50 bg-error-container text-on-error-container',
    life_threatening: 'border-error bg-error text-on-primary font-semibold',
  };
  const label = t(`health.severity.allergy.${severity}`);
  return (
    <Badge className={`mt-1 ${cls[severity]}`}>
      {label}
    </Badge>
  );
}
