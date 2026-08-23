import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Document export helpers (PDF + CSV).
 *
 * Note: PDFs use the built-in Helvetica font, which renders Latin text only.
 * Labels are in English and values are rendered as-is; Arabic names may not
 * display with full glyph shaping until an Arabic font is embedded.
 */

const egp = (n: number) => `EGP ${Number(n || 0).toFixed(2)}`;
const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 80);

function startDoc(title: string, subtitle?: string): { doc: jsPDF; y: number } {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(title, 40, 50);
  doc.setFont('helvetica', 'normal');
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(subtitle, 40, 68);
    doc.setTextColor(0);
  }
  doc.setDrawColor(210);
  doc.line(40, 78, 555, 78);
  return { doc, y: 96 };
}

function labelValueTable(doc: jsPDF, startY: number, rows: Array<[string, string]>): number {
  autoTable(doc, {
    startY,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 180 } },
    body: rows,
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

// ---------------------------------------------------------------------------
// Invoice / receipt
// ---------------------------------------------------------------------------
export type InvoicePdfInput = {
  invoiceNumber: string;
  parentName: string;
  childNames: string[];
  typeLabel: string;
  statusLabel: string;
  dueDate: string;
  createdAt: string;
  paidAt: string | null;
  paymentMethod: string | null;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  tax: number;
  total: number;
  receipt?: boolean;
};

export function downloadInvoicePdf(input: InvoicePdfInput) {
  const title = input.receipt ? 'Payment Receipt' : 'Invoice';
  const { doc, y } = startDoc(title, `No. ${input.invoiceNumber}`);
  let cursor = labelValueTable(doc, y, [
    ['Parent', input.parentName],
    ['Child(ren)', input.childNames.length ? input.childNames.join(', ') : '—'],
    ['Type', input.typeLabel],
    ['Status', input.statusLabel],
    ['Issued', new Date(input.createdAt).toLocaleDateString()],
    ['Due date', new Date(input.dueDate).toLocaleDateString()],
    ...(input.paidAt ? ([['Paid on', new Date(input.paidAt).toLocaleString()]] as Array<[string, string]>) : []),
    ...(input.paymentMethod ? ([['Payment method', input.paymentMethod]] as Array<[string, string]>) : []),
  ]);

  autoTable(doc, {
    startY: cursor + 16,
    head: [['Description', 'Qty', 'Unit price', 'Total']],
    body: input.lineItems.map((it) => [it.description, String(it.quantity), egp(it.unitPrice), egp(it.total)]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [63, 81, 181] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });
  cursor = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  labelValueTable(doc, cursor + 12, [
    ['Subtotal', egp(input.subtotal)],
    ['Tax', egp(input.tax)],
    ['Total', egp(input.total)],
  ]);

  doc.save(`${input.receipt ? 'receipt' : 'invoice'}-${safe(input.invoiceNumber)}.pdf`);
}

// ---------------------------------------------------------------------------
// Payslip
// ---------------------------------------------------------------------------
export type PayslipPdfInput = {
  staffName: string;
  position?: string;
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  bonuses: number;
  deductions: number;
  total: number;
  statusLabel: string;
  paymentDate?: string | null;
};

export function downloadPayslipPdf(input: PayslipPdfInput) {
  const period = `${input.periodStart} → ${input.periodEnd}`;
  const { doc, y } = startDoc('Payslip', period);
  labelValueTable(doc, y, [
    ['Employee', input.staffName],
    ...(input.position ? ([['Position', input.position]] as Array<[string, string]>) : []),
    ['Pay period', period],
    ['Base salary', egp(input.baseSalary)],
    ['Bonuses', egp(input.bonuses)],
    ['Deductions', `- ${egp(input.deductions)}`],
    ['Net total', egp(input.total)],
    ['Status', input.statusLabel],
    ...(input.paymentDate ? ([['Paid on', new Date(input.paymentDate).toLocaleDateString()]] as Array<[string, string]>) : []),
  ]);
  doc.save(`payslip-${safe(input.staffName)}-${safe(input.periodStart)}.pdf`);
}

// ---------------------------------------------------------------------------
// Financial report
// ---------------------------------------------------------------------------
export type FinancialReportInput = {
  rangeLabel: string;
  metrics: {
    totalRevenue: number;
    outstandingAmount: number;
    outstandingCount: number;
    overdueAmount: number;
    overdueCount: number;
    avgDaysOverdue: number;
    collectionRate: number;
  };
  statusData: Array<{ status: string; count: number; amount: number }>;
  typesData: Array<{ type: string; amount: number }>;
  topPayingParents: Array<{ parentName: string; total: number; count: number }>;
  overdueInvoices: Array<{ invoiceNumber: string; parentName: string; amount: number; daysOverdue: number }>;
};

export function downloadFinancialReportPdf(input: FinancialReportInput, opts?: { termProgress?: boolean }) {
  const title = opts?.termProgress ? 'Term Progress Report' : 'Financial Report';
  const { doc, y } = startDoc(title, input.rangeLabel);
  let cursor = labelValueTable(doc, y, [
    ['Total revenue', egp(input.metrics.totalRevenue)],
    ['Outstanding', `${egp(input.metrics.outstandingAmount)} (${input.metrics.outstandingCount})`],
    ['Overdue', `${egp(input.metrics.overdueAmount)} (${input.metrics.overdueCount})`],
    ['Avg days overdue', String(input.metrics.avgDaysOverdue)],
    ['Collection rate', `${input.metrics.collectionRate.toFixed(1)}%`],
  ]);

  autoTable(doc, {
    startY: cursor + 14,
    head: [['Status', 'Count', 'Amount']],
    body: input.statusData.map((s) => [s.status, String(s.count), egp(s.amount)]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [63, 81, 181] },
  });
  cursor = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  if (input.topPayingParents.length) {
    autoTable(doc, {
      startY: cursor + 14,
      head: [['Top paying parents', 'Payments', 'Total']],
      body: input.topPayingParents.map((p) => [p.parentName, String(p.count), egp(p.total)]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [63, 81, 181] },
    });
    cursor = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  if (input.overdueInvoices.length) {
    autoTable(doc, {
      startY: cursor + 14,
      head: [['Overdue invoice', 'Parent', 'Amount', 'Days']],
      body: input.overdueInvoices.map((o) => [o.invoiceNumber, o.parentName, egp(o.amount), String(o.daysOverdue)]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [183, 28, 28] },
    });
  }

  doc.save(`${opts?.termProgress ? 'term-progress' : 'financial-report'}-${safe(input.rangeLabel)}.pdf`);
}

// ---------------------------------------------------------------------------
// CSV (Excel-compatible)
// ---------------------------------------------------------------------------
function toCsvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((r) => r.map(toCsvCell).join(',')).join('\n');
  // BOM so Excel opens UTF-8 (Arabic) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadFinancialReportCsv(input: FinancialReportInput) {
  const rows: Array<Array<string | number>> = [
    ['Financial report', input.rangeLabel],
    [],
    ['Metric', 'Value'],
    ['Total revenue', input.metrics.totalRevenue.toFixed(2)],
    ['Outstanding amount', input.metrics.outstandingAmount.toFixed(2)],
    ['Outstanding count', input.metrics.outstandingCount],
    ['Overdue amount', input.metrics.overdueAmount.toFixed(2)],
    ['Overdue count', input.metrics.overdueCount],
    ['Avg days overdue', input.metrics.avgDaysOverdue],
    ['Collection rate %', input.metrics.collectionRate.toFixed(1)],
    [],
    ['Status', 'Count', 'Amount'],
    ...input.statusData.map((s) => [s.status, s.count, s.amount.toFixed(2)]),
    [],
    ['Invoice type', 'Revenue'],
    ...input.typesData.map((tp) => [tp.type, tp.amount.toFixed(2)]),
    [],
    ['Top paying parent', 'Payments', 'Total'],
    ...input.topPayingParents.map((p) => [p.parentName, p.count, p.total.toFixed(2)]),
    [],
    ['Overdue invoice', 'Parent', 'Amount', 'Days overdue'],
    ...input.overdueInvoices.map((o) => [o.invoiceNumber, o.parentName, o.amount.toFixed(2), o.daysOverdue]),
  ];
  downloadCsv(`financial-report-${safe(input.rangeLabel)}.csv`, rows);
}
