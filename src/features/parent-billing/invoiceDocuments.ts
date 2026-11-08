import { downloadInvoicePdf } from '@/lib/exports';
import { parseInvoiceLineItems } from '@/lib/invoiceItems';
import { formatMoneyAmount } from '@/lib/money';

import { localName } from './parentBilling';
import type { BillingInvoiceDetails } from './parentBillingApi';

/*
 * Keeping a copy of an invoice: print it, share a link to it, or save it as an image or a PDF.
 * Each returns whether it worked, so the screen can say so; none of them throws.
 */

type Translate = (key: string, values?: Record<string, unknown>) => string;

const safeFileName = (value: string) => value.replace(/[^\w.-]+/g, '_').slice(0, 80);

export function printInvoice(): void {
  window.print();
}

/** The phone's share sheet when there is one, else the link is copied. 'copied' tells the screen to say so. */
export async function shareInvoice(invoice: Pick<BillingInvoiceDetails, 'invoiceNumber' | 'amount'>, t: Translate): Promise<'shared' | 'copied' | 'failed'> {
  const text = `${invoice.invoiceNumber} - ${t('invoice.egpAmount', { amount: formatMoneyAmount(invoice.amount) })}`;
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: invoice.invoiceNumber, text, url });
      return 'shared';
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return 'copied';
    }
  } catch (error) {
    // Closing the share sheet is not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
  }
  return 'failed';
}

/** A picture of the invoice as it looks on screen. */
export async function downloadInvoiceImage(element: HTMLElement, invoiceNumber: string): Promise<boolean> {
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: Math.min(2, window.devicePixelRatio || 1.5) });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `invoice-${safeFileName(invoiceNumber)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch {
    return false;
  }
}

/** The invoice, or once paid its receipt, as a PDF in the reader's language. */
export function downloadInvoiceDocument(invoice: BillingInvoiceDetails, t: Translate, language: string, receipt: boolean): boolean {
  try {
    const { items, tax } = parseInvoiceLineItems(invoice.lineItems, language);
    const isArabic = language.startsWith('ar');
    downloadInvoicePdf({
      receipt,
      invoiceNumber: invoice.invoiceNumber,
      parentName: localName(invoice.parent, isArabic),
      childNames: invoice.children.map((c) => localName(c, isArabic)).filter(Boolean),
      typeLabel: t(`invoice.types.${invoice.type}`),
      statusLabel: t(`invoice.status.${invoice.status}`),
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      paidAt: invoice.paidAt,
      paymentMethod: invoice.paymentMethod ? t(`invoice.paymentMethods.${invoice.paymentMethod}`, { defaultValue: invoice.paymentMethod }) : null,
      lineItems: items,
      subtotal: items.reduce((sum, item) => sum + item.total, 0),
      tax,
      total: invoice.amount,
    });
    return true;
  } catch {
    return false;
  }
}
