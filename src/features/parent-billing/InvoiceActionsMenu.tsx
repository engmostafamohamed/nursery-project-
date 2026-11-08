import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { downloadInvoiceDocument, downloadInvoiceImage, printInvoice, shareInvoice } from './invoiceDocuments';
import type { BillingInvoiceDetails } from './parentBillingApi';

/**
 * Print, share and download in one "⋯" menu, so they never stand between the parent and paying.
 * `printable` is the element saved as an image (the invoice as it looks on screen).
 */
export function InvoiceActionsMenu({ invoice, printable }: { invoice: BillingInvoiceDetails; printable: () => HTMLElement | null }) {
  const { t, i18n } = useTranslation();
  const failed = () => toast.error(t('payment.errors.actionFailed'));

  const actions = [
    { key: 'print', icon: 'print', label: t('parentBilling.actions.print'), run: () => printInvoice() },
    {
      key: 'share',
      icon: 'share',
      label: t('parentBilling.actions.share'),
      run: async () => {
        const result = await shareInvoice(invoice, t);
        if (result === 'copied') toast.success(t('parentBilling.actions.linkCopied'));
        if (result === 'failed') failed();
      },
    },
    {
      key: 'image',
      icon: 'image',
      label: t('parentBilling.actions.image'),
      run: async () => {
        const element = printable();
        if (!element || !(await downloadInvoiceImage(element, invoice.invoiceNumber))) failed();
      },
    },
    {
      key: 'pdf',
      icon: 'picture_as_pdf',
      label: t('parentBilling.actions.pdf'),
      run: () => {
        if (!downloadInvoiceDocument(invoice, t, i18n.language, false)) failed();
      },
    },
    ...(invoice.status === 'paid'
      ? [{
          key: 'receipt',
          icon: 'receipt',
          label: t('parentBilling.actions.receipt'),
          run: () => {
            if (!downloadInvoiceDocument(invoice, t, i18n.language, true)) failed();
          },
        }]
      : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={t('parentBilling.actions.more')} className="no-print">
          <MaterialSymbol name="more_horiz" size="text-xl" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem key={action.key} onSelect={() => void action.run()} className="gap-2">
            <MaterialSymbol name={action.icon} size="text-lg" className="text-on-surface-variant" />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
