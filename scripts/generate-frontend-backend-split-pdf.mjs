import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const docsOutputPath = path.join(root, 'docs', 'xo-platform-frontend-backend-split.pdf');
const rootOutputPath = path.join(root, 'project-frontend-backend-split.pdf');

const generatedAt = new Date().toISOString().slice(0, 10);

const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'attached_assets']);
const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.html', '.md', '.sql', '.toml']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function safeRead(relPath) {
  const fullPath = path.join(root, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function countLines(fullPath) {
  if (!sourceExts.has(path.extname(fullPath).toLowerCase())) return 0;
  const text = fs.readFileSync(fullPath, 'utf8');
  return text ? text.split(/\r?\n/).length : 0;
}

function groupCount(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function currentLayer(rel) {
  if (rel.startsWith('src/pages/')) return 'frontend pages';
  if (rel.startsWith('src/components/')) return 'frontend components';
  if (rel.startsWith('src/hooks/')) return 'frontend hooks';
  if (rel.startsWith('src/lib/')) return 'frontend/domain lib';
  if (rel.startsWith('src/features/')) return 'existing feature slices';
  if (rel.startsWith('src/router/')) return 'frontend router';
  if (rel.startsWith('src/providers/')) return 'frontend providers';
  if (rel.startsWith('src/types/')) return 'frontend/global types';
  if (rel.startsWith('supabase/functions/')) return 'backend edge functions';
  if (rel.startsWith('supabase/migrations/')) return 'backend migrations';
  if (rel.startsWith('scripts/')) return 'scripts';
  if (rel.startsWith('docs/')) return 'docs';
  return 'root/config';
}

const featureModules = [
  {
    feature: 'auth-access',
    title: 'Auth and Access',
    frontend: ['apps/web/src/features/auth-access/pages/LoginPage.tsx', 'hooks/useAuthSession.ts', 'components/AuthShell.tsx'],
    backend: ['backend/supabase/auth policies', 'backend/supabase/functions/* when auth callbacks are needed'],
    shared: ['packages/shared/src/auth/types.ts', 'packages/shared/src/auth/roles.ts'],
  },
  {
    feature: 'platform-admin',
    title: 'XO Platform Admin',
    frontend: ['apps/web/src/features/platform-admin/pages/*', 'components/NurseryForm.tsx', 'hooks/useNurseries.ts'],
    backend: ['backend/supabase/migrations/nurseries*.sql', 'backend/supabase/functions/tenant-export'],
    shared: ['packages/shared/src/platform/types.ts'],
  },
  {
    feature: 'tenant-settings-rbac',
    title: 'Tenant Settings and RBAC',
    frontend: ['apps/web/src/features/tenant-settings-rbac/pages/*', 'components/PermissionMatrix.tsx', 'hooks/usePermissions.ts'],
    backend: ['backend/supabase/migrations/rbac*.sql', 'backend/supabase/migrations/roles*.sql'],
    shared: ['packages/shared/src/permissions/matrix.ts', 'packages/shared/src/permissions/can.ts'],
  },
  {
    feature: 'admin-dashboard',
    title: 'Admin Dashboard',
    frontend: ['apps/web/src/features/admin-dashboard/pages/Dashboard.tsx', 'components/StatsCards.tsx', 'hooks/useDashboardStats.ts'],
    backend: ['backend/supabase/views/dashboard*.sql', 'backend/supabase/rpc/dashboard*.sql'],
    shared: ['packages/shared/src/dashboard/types.ts'],
  },
  {
    feature: 'nursery-onboarding',
    title: 'Nursery Setup Onboarding',
    frontend: ['apps/web/src/features/nursery-onboarding/pages/steps/*', 'components/OnboardingFrame.tsx'],
    backend: ['backend/supabase/migrations/onboarding*.sql'],
    shared: ['packages/shared/src/onboarding/schema.ts'],
  },
  {
    feature: 'children-profiles',
    title: 'Children and Profiles',
    frontend: ['apps/web/src/features/children-profiles/pages/*', 'components/ChildSelector.tsx', 'hooks/useChildren.ts'],
    backend: ['backend/supabase/migrations/children*.sql', 'backend/supabase/storage/child-avatars'],
    shared: ['packages/shared/src/children/types.ts'],
  },
  {
    feature: 'child-enrollment',
    title: 'Child Enrollment',
    frontend: ['apps/web/src/features/child-enrollment/pages/*', 'components/ChildEnrollmentWizard.tsx', 'steps/*.tsx'],
    backend: ['backend/supabase/functions/child-enrollment-complete', 'backend/supabase/storage/enrollment-documents'],
    shared: ['packages/shared/src/child-enrollment/schema.ts'],
  },
  {
    feature: 'parent-signup',
    title: 'Parent Signup',
    frontend: ['apps/web/src/features/parent-signup/pages/ParentSignUpPage.tsx', 'components/signup/*'],
    backend: ['backend/supabase/functions/parent-signup-complete', 'backend/supabase/storage/signup-documents'],
    shared: ['packages/shared/src/parent-signup/schema.ts'],
  },
  {
    feature: 'admissions-applications',
    title: 'Admissions and Applications',
    frontend: ['apps/web/src/features/admissions-applications/pages/*', 'components/InquiryKanban.tsx', 'components/ApplicationReviewTabs.tsx'],
    backend: ['backend/supabase/migrations/admissions*.sql', 'backend/supabase/migrations/applications*.sql'],
    shared: ['packages/shared/src/admissions/types.ts'],
  },
  {
    feature: 'bulk-import',
    title: 'Bulk Import',
    frontend: ['apps/web/src/features/bulk-import/pages/*', 'components/ImportWizard.tsx', 'components/ColumnMapper.tsx'],
    backend: ['backend/supabase/functions/process-import', 'backend/supabase/functions/ai-import-mapper'],
    shared: ['packages/shared/src/import/validation.ts'],
  },
  {
    feature: 'attendance',
    title: 'Attendance',
    frontend: ['apps/web/src/features/attendance/pages/*', 'components/AttendanceDailyBars.tsx', 'hooks/useAttendance.ts'],
    backend: ['backend/supabase/migrations/attendance*.sql', 'backend/supabase/rpc/attendance*.sql'],
    shared: ['packages/shared/src/attendance/types.ts'],
  },
  {
    feature: 'classes',
    title: 'Classes and Class Staff',
    frontend: ['apps/web/src/features/classes/pages/*', 'components/ClassStaffEditor.tsx', 'hooks/useClassStaff.ts'],
    backend: ['backend/supabase/migrations/class_staff*.sql', 'backend/supabase/rpc/set_class_lead.sql'],
    shared: ['packages/shared/src/classes/types.ts'],
  },
  {
    feature: 'courses',
    title: 'Courses',
    frontend: ['apps/web/src/features/courses/pages/*', 'components/CourseCard.tsx', 'hooks/useCourses.ts'],
    backend: ['backend/supabase/migrations/courses*.sql'],
    shared: ['packages/shared/src/courses/schema.ts'],
  },
  {
    feature: 'events-permissions',
    title: 'Events and Permissions',
    frontend: ['apps/web/src/features/events-permissions/pages/*', 'components/EventFormFields.tsx', 'hooks/useEventPermissions.ts'],
    backend: ['backend/supabase/functions/event-qr-issue', 'backend/supabase/functions/permission-deadline-reminder'],
    shared: ['packages/shared/src/events/schema.ts'],
  },
  {
    feature: 'invoices-payments',
    title: 'Invoices and Payments',
    frontend: ['apps/web/src/features/invoices-payments/pages/*', 'components/InvoiceCard.tsx', 'hooks/useInvoices.ts'],
    backend: ['backend/supabase/functions/payment-reminders', 'apps/api/src/modules/payments if Paymob secret flow grows'],
    shared: ['packages/shared/src/billing/types.ts'],
  },
  {
    feature: 'financial-reports',
    title: 'Financial Reports',
    frontend: ['apps/web/src/features/financial-reports/pages/*', 'components/charts/*.tsx', 'hooks/useFinancialReports.ts'],
    backend: ['backend/supabase/views/finance*.sql', 'backend/supabase/rpc/finance*.sql'],
    shared: ['packages/shared/src/finance/formatters.ts'],
  },
  {
    feature: 'staff-hr',
    title: 'Staff and HR',
    frontend: ['apps/web/src/features/staff-hr/pages/*', 'components/StaffDirectoryTable.tsx', 'hooks/useStaff.ts'],
    backend: ['backend/supabase/migrations/staff_profiles*.sql', 'backend/supabase/migrations/manager_hr*.sql'],
    shared: ['packages/shared/src/staff/types.ts'],
  },
  {
    feature: 'staff-onboarding',
    title: 'Staff Onboarding',
    frontend: ['apps/web/src/features/staff-onboarding/pages/*', 'components/StaffOnboardingWizard.tsx', 'steps/*.tsx'],
    backend: ['backend/supabase/functions/staff-onboarding-complete', 'backend/supabase/storage/staff-documents'],
    shared: ['packages/shared/src/staff-onboarding/schema.ts'],
  },
  {
    feature: 'payroll-payslips',
    title: 'Payroll and Payslips',
    frontend: ['apps/web/src/features/payroll-payslips/pages/*', 'components/PayslipForm.tsx', 'hooks/usePayroll.ts'],
    backend: ['backend/supabase/migrations/staff_payroll*.sql'],
    shared: ['packages/shared/src/payroll/types.ts'],
  },
  {
    feature: 'media-gallery',
    title: 'Media Upload and Gallery',
    frontend: ['apps/web/src/features/media-gallery/pages/*', 'components/MediaApprovalGrid.tsx', 'hooks/useMedia.ts'],
    backend: ['backend/supabase/migrations/media*.sql', 'backend/supabase/storage/media'],
    shared: ['packages/shared/src/media/types.ts'],
  },
  {
    feature: 'daily-reports',
    title: 'Daily Reports',
    frontend: ['apps/web/src/features/daily-reports/pages/*', 'components/DailyReportForm.tsx', 'sections/*.tsx'],
    backend: ['backend/supabase/migrations/daily_reports*.sql'],
    shared: ['packages/shared/src/daily-reports/schema.ts'],
  },
  {
    feature: 'milestones-reports',
    title: 'Milestones and Quarterly Reports',
    frontend: ['apps/web/src/features/milestones-reports/pages/*', 'components/MilestoneCard.tsx', 'hooks/useMilestones.ts'],
    backend: ['backend/supabase/migrations/milestones*.sql', 'backend/supabase/migrations/quarterly_reports*.sql'],
    shared: ['packages/shared/src/milestones/types.ts'],
  },
  {
    feature: 'health-safety',
    title: 'Health and Safety',
    frontend: ['apps/web/src/features/health-safety/pages/*', 'components/HealthOverviewCard.tsx', 'components/dialogs/*.tsx'],
    backend: ['backend/supabase/migrations/child_health*.sql', 'backend/supabase/storage/health-documents'],
    shared: ['packages/shared/src/health/schema.ts'],
  },
  {
    feature: 'chat-messages',
    title: 'Chat and Messages',
    frontend: ['apps/web/src/features/chat-messages/pages/*', 'components/ChatPanel.tsx', 'hooks/useChat.ts'],
    backend: ['backend/supabase/migrations/chat*.sql', 'backend/supabase/realtime/chat publication'],
    shared: ['packages/shared/src/chat/types.ts'],
  },
  {
    feature: 'broadcast-notifications',
    title: 'Broadcasts and Notifications',
    frontend: ['apps/web/src/features/broadcast-notifications/pages/*', 'components/NotificationCenterDrawer.tsx'],
    backend: ['backend/supabase/functions/email-dispatch', 'sms-dispatch', 'whatsapp-dispatch', 'emergency-broadcast'],
    shared: ['packages/shared/src/notifications/types.ts'],
  },
  {
    feature: 'surveys-forms',
    title: 'Surveys and Forms',
    frontend: ['apps/web/src/features/surveys-forms/pages/*', 'components/FormBuilder.tsx', 'components/FormRenderer.tsx'],
    backend: ['backend/supabase/migrations/surveys*.sql'],
    shared: ['packages/shared/src/surveys/schema.ts'],
  },
  {
    feature: 'inventory',
    title: 'Inventory',
    frontend: ['apps/web/src/features/inventory/pages/InventoryPage.tsx', 'hooks/useInventory.ts'],
    backend: ['backend/supabase/migrations/inventory*.sql'],
    shared: ['packages/shared/src/inventory/types.ts'],
  },
  {
    feature: 'meals-nutrition',
    title: 'Meals and Nutrition',
    frontend: ['apps/web/src/features/meals-nutrition/pages/*', 'components/MealsSection.tsx', 'hooks/useMealPlans.ts'],
    backend: ['backend/supabase/migrations/meals*.sql'],
    shared: ['packages/shared/src/meals/types.ts'],
  },
  {
    feature: 'loyalty-rewards-packages',
    title: 'Loyalty, Rewards, Packages',
    frontend: ['apps/web/src/features/loyalty-rewards-packages/pages/*', 'components/LoyaltyDashboard.tsx'],
    backend: ['backend/supabase/migrations/loyalty*.sql', 'backend/supabase/migrations/packages*.sql'],
    shared: ['packages/shared/src/loyalty/types.ts'],
  },
  {
    feature: 'qr-pickup-checkin',
    title: 'QR, Pickup, Check-in',
    frontend: ['apps/web/src/features/qr-pickup-checkin/pages/*', 'components/ChildQrCodeCard.tsx', 'components/QRScanner.tsx'],
    backend: ['backend/supabase/functions/qr-token', 'backend/supabase/functions/qr-verify'],
    shared: ['packages/shared/src/qr/types.ts'],
  },
  {
    feature: 'community-content',
    title: 'Community and Content Library',
    frontend: ['apps/web/src/features/community-content/pages/*', 'hooks/useCommunity.ts', 'hooks/useContentLibrary.ts'],
    backend: ['backend/supabase/migrations/community_content*.sql'],
    shared: ['packages/shared/src/content/types.ts'],
  },
  {
    feature: 'personal-reminders',
    title: 'Personal Reminders',
    frontend: ['apps/web/src/features/personal-reminders/pages/RemindersPage.tsx', 'components/ReminderAlertHost.tsx'],
    backend: ['backend/supabase/migrations/personal_reminders*.sql'],
    shared: ['packages/shared/src/reminders/types.ts'],
  },
  {
    feature: 'ai-help',
    title: 'AI Assistant and Help',
    frontend: ['apps/web/src/features/ai-help/components/AIAssistant.tsx', 'components/HelpPanel.tsx', 'hooks/useAiAssistant.ts'],
    backend: ['backend/supabase/functions/ai-assistant'],
    shared: ['packages/shared/src/ai/types.ts', 'packages/shared/src/help/articles.ts'],
  },
  {
    feature: 'pwa-i18n-theme',
    title: 'PWA, I18n, Theme',
    frontend: ['apps/web/src/app/pwa/*', 'apps/web/src/locales/*', 'apps/web/src/shared/theme/*'],
    backend: ['public/sw.js stays with web app; no backend required'],
    shared: ['packages/shared/src/i18n/types.ts'],
  },
  {
    feature: 'ops-backup-export',
    title: 'Ops, Backup, Export',
    frontend: ['apps/web/src/features/ops/pages/*', 'components/TenantExportCard.tsx'],
    backend: ['backend/supabase/functions/tenant-export', 'scripts/ops/*', 'docs/runbooks/*'],
    shared: ['packages/shared/src/ops/types.ts'],
  },
];

const files = walk(root);
const relFiles = files.map((file) => toPosix(path.relative(root, file)));
const sourceFiles = files.filter((file) => sourceExts.has(path.extname(file).toLowerCase()));
const routerText = safeRead('src/router/AppRouter.tsx');
const packageJson = JSON.parse(safeRead('package.json'));
const edgeFunctions = relFiles
  .filter((rel) => rel.startsWith('supabase/functions/') && rel.endsWith('index.ts'))
  .map((rel) => rel.split('/')[2])
  .filter((name) => name && !name.startsWith('_'))
  .sort();
const migrations = relFiles.filter((rel) => rel.startsWith('supabase/migrations/') && rel.endsWith('.sql'));
const routes = [...routerText.matchAll(/<Route\s+(?:index|path=)/g)].length;
const totalLines = sourceFiles.reduce((sum, file) => sum + countLines(file), 0);

const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 42;
const contentWidth = pageWidth - margin * 2;

const colors = {
  ink: [24, 32, 45],
  muted: [90, 105, 128],
  border: [216, 226, 238],
  panel: [248, 250, 253],
  web: [37, 99, 235],
  backend: [22, 163, 74],
  shared: [124, 58, 237],
  api: [217, 119, 6],
  ops: [15, 118, 110],
  danger: [220, 38, 38],
  slate: [51, 65, 85],
};

function setText(color = colors.ink, size = 10, style = 'normal', font = 'helvetica') {
  doc.setTextColor(...color);
  doc.setFont(font, style);
  doc.setFontSize(size);
}

function addPage() {
  doc.addPage();
}

function sectionTitle(title, y, subtitle) {
  setText(colors.ink, 17, 'bold');
  doc.text(title, margin, y);
  doc.setDrawColor(...colors.web);
  doc.setLineWidth(2);
  doc.line(margin, y + 8, margin + 46, y + 8);
  if (subtitle) {
    setText(colors.muted, 9);
    doc.text(doc.splitTextToSize(subtitle, contentWidth), margin, y + 24);
    return y + 48;
  }
  return y + 26;
}

function table(head, body, startY, options = {}) {
  autoTable(doc, {
    head: [head],
    body,
    startY,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: options.fontSize ?? 7.2,
      cellPadding: 4,
      overflow: 'linebreak',
      lineColor: colors.border,
      lineWidth: 0.4,
      textColor: colors.ink,
    },
    headStyles: {
      fillColor: colors.slate,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    tableWidth: options.tableWidth ?? contentWidth,
    columnStyles: options.columnStyles ?? {},
  });
  return doc.lastAutoTable.finalY + 16;
}

function card(x, y, w, h, title, value, note, accent) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 6, h, 3, 3, 'F');
  setText(colors.muted, 8, 'bold');
  doc.text(title.toUpperCase(), x + 16, y + 18);
  setText(colors.ink, 21, 'bold');
  doc.text(String(value), x + 16, y + 43);
  setText(colors.muted, 7.7);
  doc.text(doc.splitTextToSize(note, w - 24), x + 16, y + 59);
}

function drawTree(x, y, lines, lineHeight = 10.5, size = 7.8) {
  setText(colors.slate, size, 'normal', 'courier');
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * lineHeight);
  });
  doc.setFont('helvetica', 'normal');
}

function drawFlowBox(x, y, w, h, title, body, color) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, 7, 4, 4, 'F');
  setText(colors.ink, 11, 'bold');
  doc.text(title, x + 10, y + 24);
  setText(colors.muted, 7.8);
  doc.text(doc.splitTextToSize(body, w - 20), x + 10, y + 40);
}

function arrow(x1, y1, x2, y2) {
  doc.setDrawColor(...colors.muted);
  doc.setLineWidth(1);
  doc.line(x1, y1, x2, y2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 6;
  const a1 = angle - Math.PI / 7;
  const a2 = angle + Math.PI / 7;
  doc.setFillColor(...colors.muted);
  doc.triangle(
    x2,
    y2,
    x2 - size * Math.cos(a1),
    y2 - size * Math.sin(a1),
    x2 - size * Math.cos(a2),
    y2 - size * Math.sin(a2),
    'F',
  );
}

function drawArchitectureDiagram(x, y, w) {
  const boxW = (w - 32) / 3;
  drawFlowBox(x, y, boxW, 88, 'apps/web', 'React, Vite, routes, feature pages, UI, client data hooks.', colors.web);
  drawFlowBox(x + boxW + 16, y, boxW, 88, 'packages/shared', 'Types, permissions, Zod schemas, constants, pure formatters.', colors.shared);
  drawFlowBox(x + (boxW + 16) * 2, y, boxW, 88, 'backend/supabase', 'Postgres migrations, RLS, storage, realtime, Edge Functions.', colors.backend);
  arrow(x + boxW, y + 44, x + boxW + 16, y + 44);
  arrow(x + boxW * 2 + 16, y + 44, x + (boxW + 16) * 2, y + 44);

  const lowerY = y + 124;
  drawFlowBox(x + 76, lowerY, boxW, 78, 'apps/api optional', 'Only add if you need long-running jobs, protected server secrets, webhooks, or a BFF layer.', colors.api);
  drawFlowBox(x + boxW + 136, lowerY, boxW, 78, 'scripts + docs + tests', 'Ops scripts, seed tools, runbooks, E2E tests, RLS regression tests.', colors.ops);
  arrow(x + (boxW + 16) * 2 + boxW / 2, y + 88, x + 76 + boxW / 2, lowerY);
  arrow(x + (boxW + 16) * 2 + boxW / 2, y + 88, x + boxW + 136 + boxW / 2, lowerY);
}

function drawBarChart(x, y, w, h, data) {
  const rows = data.filter((item) => item.value > 0).slice(0, 10);
  const max = Math.max(...rows.map((item) => item.value), 1);
  const labelW = 140;
  const rowH = h / rows.length;
  rows.forEach((item, index) => {
    const yy = y + index * rowH + 3;
    setText(colors.slate, 7.2);
    doc.text(item.label, x, yy + 8);
    doc.setFillColor(234, 240, 248);
    doc.roundedRect(x + labelW, yy, w - labelW - 36, 9, 4, 4, 'F');
    doc.setFillColor(...[colors.web, colors.backend, colors.shared, colors.api, colors.ops][index % 5]);
    doc.roundedRect(x + labelW, yy, Math.max(2, ((w - labelW - 36) * item.value) / max), 9, 4, 4, 'F');
    setText(colors.muted, 7.2, 'bold');
    doc.text(String(item.value), x + w - 24, yy + 8);
  });
}

function drawFeatureSplitCard(feature, x, y, w, h) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...colors.web);
  doc.rect(x, y, w / 3, 5, 'F');
  doc.setFillColor(...colors.shared);
  doc.rect(x + w / 3, y, w / 3, 5, 'F');
  doc.setFillColor(...colors.backend);
  doc.rect(x + (w / 3) * 2, y, w / 3, 5, 'F');

  setText(colors.ink, 11, 'bold');
  doc.text(feature.title, x + 10, y + 21);
  setText(colors.muted, 7, 'bold');
  doc.text(`src/features/${feature.feature}`, x + 10, y + 35);

  const colW = (w - 28) / 3;
  const labels = [
    ['Frontend', feature.frontend, colors.web],
    ['Shared', feature.shared, colors.shared],
    ['Backend', feature.backend, colors.backend],
  ];
  labels.forEach(([label, lines, color], index) => {
    const cx = x + 10 + index * colW;
    setText(color, 7.6, 'bold');
    doc.text(label, cx, y + 53);
    setText(colors.muted, 6.1);
    doc.text(doc.splitTextToSize(lines.join('\n'), colW - 8), cx, y + 65);
  });
}

function addFooters() {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...colors.border);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    setText(colors.muted, 7);
    doc.text(`XO Platform frontend/backend split structure - generated ${generatedAt}`, margin, pageHeight - 20);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin - 48, pageHeight - 20);
  }
}

// Cover
doc.setFillColor(248, 250, 252);
doc.rect(0, 0, pageWidth, pageHeight, 'F');
doc.setFillColor(...colors.slate);
doc.rect(0, 0, pageWidth, 170, 'F');
setText([255, 255, 255], 28, 'bold');
doc.text('XO Platform', margin, 70);
setText([226, 232, 240], 16, 'bold');
doc.text('Frontend / Backend Split - Graphic Project Structure', margin, 100);
setText([226, 232, 240], 10);
doc.text(`Generated from local repository on ${generatedAt}`, margin, 124);

card(margin, 206, 118, 86, 'Features', featureModules.length, 'Target modules in this plan.', colors.web);
card(margin + 132, 206, 118, 86, 'Routes', routes, 'Current React routes detected.', colors.shared);
card(margin + 264, 206, 118, 86, 'Edge funcs', edgeFunctions.length, 'Current Supabase functions.', colors.backend);
card(margin + 396, 206, 118, 86, 'Migrations', migrations.length, 'Current SQL migration files.', colors.api);

let y = 334;
setText(colors.ink, 15, 'bold');
doc.text('Recommended Split', margin, y);
y += 22;
setText(colors.muted, 10);
doc.text(
  doc.splitTextToSize(
    'Use a monorepo split. The frontend lives in apps/web, Supabase lives in backend/supabase, shared contracts live in packages/shared and packages/database, and apps/api stays optional for server-only workflows that outgrow Edge Functions.',
    contentWidth,
  ),
  margin,
  y,
);
y += 78;
drawArchitectureDiagram(margin, y, contentWidth);

// Full structure page
addPage();
y = sectionTitle('Full Project File Structure', 58, 'Target tree for splitting frontend and backend while keeping the project working as one repository.');
drawTree(margin, y, [
  'XO-platform/',
  '  apps/',
  '    web/',
  '      public/',
  '      src/',
  '        app/',
  '          router/',
  '          providers/',
  '          layouts/',
  '        features/',
  '          auth-access/',
  '          platform-admin/',
  '          tenant-settings-rbac/',
  '          attendance/',
  '          events-permissions/',
  '          invoices-payments/',
  '          child-enrollment/',
  '          staff-onboarding/',
  '          ... all product features',
  '        shared/',
  '          ui/',
  '          components/',
  '          hooks/',
  '          lib/',
  '          types/',
  '        assets/',
  '        locales/',
  '        main.tsx',
  '        index.css',
  '      index.html',
  '      vite.config.ts',
  '      package.json',
  '    api/',
  '      src/',
  '        modules/',
  '        middleware/',
  '        config/',
  '        jobs/',
  '        tests/',
  '      package.json',
  '  backend/',
  '    supabase/',
  '      migrations/',
  '      functions/',
  '      seed/',
  '      config.toml',
  '  packages/',
  '    shared/',
  '      src/types/',
  '      src/constants/',
  '      src/permissions/',
  '      src/validation/',
  '      src/formatters/',
  '    database/',
  '      src/generated.types.ts',
  '      src/tables.ts',
  '      src/queryKeys.ts',
  '    config/',
  '      eslint/',
  '      typescript/',
  '      tailwind/',
  '  scripts/',
  '    dev/',
  '    seed/',
  '    ops/',
  '    reports/',
  '  docs/',
  '    architecture/',
  '    runbooks/',
  '    audits/',
  '  tests/',
  '    e2e/',
  '    integration/',
  '    rls/',
  '  package.json',
  '  README.md',
], 10.8, 7.4);

// Current to target
addPage();
y = sectionTitle('Current to Target Mapping', 58, 'How the current folders move into the split structure.');
drawBarChart(margin, y, contentWidth, 154, groupCount(relFiles, currentLayer));
y += 184;
y = table(
  ['Current location', 'Target location', 'Reason'],
  [
    ['src/pages/*', 'apps/web/src/features/<feature>/pages/*', 'Pages belong to product features, not only role folders.'],
    ['src/components/ui/*', 'apps/web/src/shared/ui/*', 'Design-system primitives stay shared in frontend.'],
    ['src/components/layouts/*', 'apps/web/src/app/layouts/*', 'Layouts are app shell, not feature UI.'],
    ['src/components/admin|parent|teacher/*', 'apps/web/src/features/<feature>/components/*', 'Move domain components beside the feature they support.'],
    ['src/hooks/useFeatureThing.ts', 'apps/web/src/features/<feature>/hooks/*', 'Feature hooks should live with their feature.'],
    ['src/hooks/generic hooks', 'apps/web/src/shared/hooks/*', 'Only app-agnostic hooks stay shared.'],
    ['src/lib/domain helpers', 'apps/web/src/features/<feature>/api or lib/*', 'Business logic belongs to the feature.'],
    ['src/lib/permissions/*', 'packages/shared/src/permissions/*', 'Permission rules should be shared across frontend and backend.'],
    ['src/types/database.ts', 'packages/database/src/generated.types.ts', 'Generated Supabase types should be a shared package.'],
    ['supabase/*', 'backend/supabase/*', 'Keep database, RLS, storage, and Edge Functions as backend.'],
    ['scripts/ops/*', 'scripts/ops/* or backend/scripts/*', 'Ops remains outside frontend app.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 190 }, 2: { cellWidth: 160 } }, fontSize: 7.3 },
);

// Frontend details
addPage();
y = sectionTitle('Frontend App Structure', 58, 'The web app should be a thin shell plus feature slices. Pages compose components and call hooks; hooks call feature API modules; shared contains only reusable primitives.');
drawTree(margin, y, [
  'apps/web/src/',
  '  app/',
  '    router/',
  '      AppRouter.tsx',
  '      routes.admin.tsx',
  '      routes.parent.tsx',
  '      routes.teacher.tsx',
  '      routes.xo-admin.tsx',
  '    providers/',
  '      AppProviders.tsx',
  '      AuthProvider.tsx',
  '      DatabaseConnectionGate.tsx',
  '    layouts/',
  '      RootLayout.tsx',
  '      AdminLayout.tsx',
  '      ParentLayout.tsx',
  '      TeacherLayout.tsx',
  '      StaffLayout.tsx',
  '      XoAdminLayout.tsx',
  '  features/<feature>/',
  '    pages/',
  '    components/',
  '    hooks/',
  '    api/',
  '    schemas/',
  '    types.ts',
  '    index.ts',
  '    __tests__/',
  '  shared/',
  '    ui/',
  '    components/',
  '    hooks/',
  '    lib/',
  '    types/',
  '  locales/',
  '  assets/',
], 11, 7.6);
y = 496;
y = table(
  ['Frontend rule', 'Clean-code meaning'],
  [
    ['Pages stay thin', 'No large Supabase query chains or business decisions in page files.'],
    ['Hooks own data state', 'React Query keys, loading states, mutations, and cache invalidation stay in feature hooks.'],
    ['API modules own backend calls', 'Supabase and Edge Function calls are typed and isolated in feature/api.'],
    ['Components are local first', 'A component is shared only after two or more features need it.'],
    ['Router imports feature route modules', 'Avoid one giant router file that imports every screen directly.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 360 } }, fontSize: 7.6 },
);

// Backend details
addPage();
y = sectionTitle('Backend Structure', 58, 'Supabase is already the backend. Move it under backend/supabase. Add apps/api only for workflows that need server runtime beyond Supabase Edge Functions.');
drawTree(margin, y, [
  'backend/supabase/',
  '  migrations/',
  '    001_foundation.sql',
  '    YYYYMMDDHHMM_feature_change.sql',
  '  functions/',
  '    _shared/',
  '      admin.ts',
  '      dispatch.ts',
  '      http.ts',
  '    ai-assistant/',
  '    ai-import-mapper/',
  '    child-enrollment-complete/',
  '    email-dispatch/',
  '    emergency-broadcast/',
  '    event-qr-issue/',
  '    parent-signup-complete/',
  '    payment-reminders/',
  '    permission-deadline-reminder/',
  '    process-import/',
  '    qr-token/',
  '    qr-verify/',
  '    sms-dispatch/',
  '    staff-onboarding-complete/',
  '    tenant-export/',
  '    whatsapp-dispatch/',
  '  seed/',
  '  config.toml',
  '',
  'apps/api/                         # optional',
  '  src/modules/<domain>/',
  '    controller.ts',
  '    service.ts',
  '    repository.ts',
  '    validation.ts',
  '    routes.ts',
  '    types.ts',
], 10.5, 7.3);
y = 484;
y = table(
  ['Backend rule', 'Clean-code meaning'],
  [
    ['Supabase is source of truth', 'Migrations, RLS, storage policies, and Edge Functions belong under backend/supabase.'],
    ['Use Edge Functions for event-driven work', 'Notifications, QR verification, imports, AI assistant, and tenant export can stay as Edge Functions.'],
    ['Add apps/api only with a reason', 'Use it for webhooks, long jobs, server-only secrets, complex orchestration, or external integrations.'],
    ['Generated types are shared', 'Regenerate DB types into packages/database and import them from frontend/backend code.'],
    ['RLS tests belong with backend', 'Add tests/rls for tenant isolation and parent/teacher/admin access rules.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 350 } }, fontSize: 7.5 },
);

// Shared packages
addPage();
y = sectionTitle('Shared Packages', 58, 'Shared code is what both frontend and backend need. Keep it small and boring: types, constants, validation schemas, permissions, and formatters.');
drawTree(margin, y, [
  'packages/',
  '  shared/',
  '    src/',
  '      types/',
  '      constants/',
  '      permissions/',
  '        matrix.ts',
  '        can.ts',
  '        types.ts',
  '      validation/',
  '        childEnrollment.schema.ts',
  '        staffOnboarding.schema.ts',
  '        event.schema.ts',
  '        payment.schema.ts',
  '      formatters/',
  '        money.ts',
  '        dates.ts',
  '        names.ts',
  '      index.ts',
  '  database/',
  '    src/',
  '      generated.types.ts',
  '      tables.ts',
  '      queryKeys.ts',
  '      index.ts',
  '  config/',
  '    eslint/',
  '    typescript/',
  '    tailwind/',
], 11, 7.6);
y = 374;
y = table(
  ['Put in shared package', 'Do not put in shared package'],
  [
    ['Role/permission constants', 'React pages or UI that belongs to one feature.'],
    ['Zod schemas reused by frontend and backend', 'Supabase client calls with feature-specific behavior.'],
    ['Generated database types', 'Stateful React hooks tied to one screen.'],
    ['Pure formatters and enums', 'Business processes that belong to one domain module.'],
    ['Cross-app query key builders', 'Large helper files that mix many features.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 250 }, 1: { cellWidth: 260 } }, fontSize: 7.6 },
);

// Feature split summary table
addPage();
y = sectionTitle('All Feature Split Map', 58, 'Every major project feature gets a frontend slice, backend ownership, and shared contract location.');
y = table(
  ['Feature', 'Frontend slice', 'Backend owner', 'Shared contract'],
  featureModules.map((feature) => [
    feature.title,
    `apps/web/src/features/${feature.feature}`,
    feature.backend[0],
    feature.shared[0],
  ]),
  y,
  { columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 160 }, 2: { cellWidth: 125 }, 3: { cellWidth: 95 } }, fontSize: 6.3 },
);

// Feature graphic cards
for (let i = 0; i < featureModules.length; i += 3) {
  addPage();
  y = sectionTitle('Feature-by-Feature Graphic Split', 58, `Frontend, shared, and backend structure for features ${i + 1}-${Math.min(i + 3, featureModules.length)}.`);
  drawFeatureSplitCard(featureModules[i], margin, y, contentWidth, 184);
  if (featureModules[i + 1]) drawFeatureSplitCard(featureModules[i + 1], margin, y + 204, contentWidth, 184);
  if (featureModules[i + 2]) drawFeatureSplitCard(featureModules[i + 2], margin, y + 408, contentWidth, 184);
}

// Migration plan
addPage();
y = sectionTitle('Migration Plan', 58, 'Recommended order to split the project without stopping development.');
y = table(
  ['Wave', 'Move', 'Done when'],
  [
    ['1', 'Create apps/web, backend/supabase, packages/shared, packages/database folders.', 'Existing app still runs from the new apps/web location.'],
    ['2', 'Move app shell: router, providers, layouts, main.tsx, index.css, public assets.', 'Routes render and auth/layouts still work.'],
    ['3', 'Move Supabase backend into backend/supabase and update scripts.', 'Migrations/functions commands point to the new backend path.'],
    ['4', 'Generate DB types into packages/database.', 'Frontend imports database types from one package and type drift drops.'],
    ['5', 'Move high-risk feature slices: events, payments, attendance, onboarding.', 'Each feature has pages/components/hooks/api/schemas/tests together.'],
    ['6', 'Move remaining features in batches.', 'No feature-specific logic remains in global hooks/lib/components folders.'],
    ['7', 'Add apps/api only if needed.', 'There is a clear server-only use case, not just folder neatness.'],
    ['8', 'Add CI gates for typecheck, lint, route smoke, and RLS tests.', 'Structure stays clean after migration.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 250 }, 2: { cellWidth: 212 } }, fontSize: 7.6 },
);
y = doc.lastAutoTable.finalY + 16;
setText(colors.ink, 12, 'bold');
doc.text('Root package scripts after split', margin, y);
y += 14;
drawTree(margin, y, [
  'package.json',
  '  scripts:',
  '    dev:web        -> npm --workspace apps/web run dev',
  '    build:web      -> npm --workspace apps/web run build',
  '    typecheck      -> npm run typecheck --workspaces',
  '    lint           -> npm run lint --workspaces',
  '    supabase:start -> supabase start --workdir backend/supabase',
  '    db:types       -> generate packages/database/src/generated.types.ts',
  '    test:e2e       -> playwright test tests/e2e',
  '    test:rls       -> run SQL regression checks',
], 11, 7.6);

// Appendix
addPage();
y = sectionTitle('Appendix', 58, 'Current repository facts used to build the graphic.');
y = table(
  ['Item', 'Detected value'],
  [
    ['Package', packageJson.name],
    ['React', packageJson.dependencies.react],
    ['Vite', packageJson.devDependencies.vite],
    ['Supabase client', packageJson.dependencies['@supabase/supabase-js']],
    ['React Router', packageJson.dependencies['react-router-dom']],
    ['React Query', packageJson.dependencies['@tanstack/react-query']],
    ['Text/code files scanned', sourceFiles.length.toLocaleString()],
    ['Approximate text/code lines', totalLines.toLocaleString()],
    ['Routes detected', String(routes)],
    ['Supabase edge functions', String(edgeFunctions.length)],
    ['Supabase migrations', String(migrations.length)],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 190 }, 1: { cellWidth: 320 } }, fontSize: 7.6 },
);
y = doc.lastAutoTable.finalY + 14;
setText(colors.ink, 12, 'bold');
doc.text('Current Edge Functions', margin, y);
y += 12;
table(
  ['Function folders'],
  edgeFunctions.map((name) => [name]),
  y,
  { columnStyles: { 0: { cellWidth: 250 } }, fontSize: 7.2 },
);

addFooters();

fs.mkdirSync(path.dirname(docsOutputPath), { recursive: true });
const bytes = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(docsOutputPath, bytes);
fs.writeFileSync(rootOutputPath, bytes);

console.log(`Wrote ${path.relative(root, docsOutputPath)}`);
console.log(`Wrote ${path.relative(root, rootOutputPath)}`);
