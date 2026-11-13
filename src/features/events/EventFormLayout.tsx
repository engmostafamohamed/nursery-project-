import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * The create and edit event pages: the title card, the form on one side and, on the other, the
 * live preview with the buttons (under the form on phones). Why a save failed shows above them.
 * Enter in a field does nothing: publishing tells every family, so only its button does it.
 */
export function EventFormLayout({ icon, title, description, backTo, preview, actions, problem, children }: {
  icon: string;
  title: string;
  description: string;
  backTo: string;
  preview: ReactNode;
  actions: ReactNode;
  problem: string | null;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <PageHeader
        icon={icon}
        eyebrow={t('admin.events.edit.breadcrumbEvents')}
        title={title}
        description={description}
        actions={
          <Button asChild variant="outline">
            <Link to={backTo}>
              <MaterialSymbol name="arrow_back" size="text-base" className="rtl:rotate-180" />
              {t('admin.events.back')}
            </Link>
          </Button>
        }
      />

      <form onSubmit={(e: FormEvent<HTMLFormElement>) => e.preventDefault()} noValidate className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">{children}</div>
        <aside className="space-y-4 lg:sticky lg:top-4">
          {preview}
          <div className="space-y-3 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
            <FormProblem message={problem} />
            <div className="flex flex-col gap-2">{actions}</div>
          </div>
        </aside>
      </form>
    </div>
  );
}
