import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const docsOutputPath = path.join(root, 'docs', 'xo-platform-structure-plan.pdf');
const rootOutputPath = path.join(root, 'project-structure-plan.pdf');

const generatedAt = new Date();
const generatedAtLabel = generatedAt.toISOString().slice(0, 10);

const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'attached_assets']);
const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.html', '.md', '.sql', '.toml']);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

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

function safeRead(relPath) {
  const fullPath = path.join(root, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function getLineCount(fullPath) {
  const ext = path.extname(fullPath).toLowerCase();
  if (!sourceExts.has(ext)) return 0;
  const text = fs.readFileSync(fullPath, 'utf8');
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
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

function countLayer(rel) {
  if (rel.startsWith('src/pages/')) return 'pages';
  if (rel.startsWith('src/components/')) return 'components';
  if (rel.startsWith('src/hooks/')) return 'hooks';
  if (rel.startsWith('src/lib/')) return 'domain lib';
  if (rel.startsWith('src/features/')) return 'existing features';
  if (rel.startsWith('src/router/')) return 'router';
  if (rel.startsWith('src/providers/')) return 'providers';
  if (rel.startsWith('src/store/')) return 'store';
  if (rel.startsWith('src/types/')) return 'types';
  if (rel.startsWith('supabase/functions/')) return 'edge functions';
  if (rel.startsWith('supabase/migrations/')) return 'migrations';
  if (rel.startsWith('scripts/')) return 'scripts';
  if (rel.startsWith('docs/')) return 'docs';
  if (rel.startsWith('public/')) return 'public assets';
  return 'root/config';
}

function displayPath(rel) {
  return rel.replace(/^src\//, 'src/').replace(/^supabase\//, 'supabase/');
}

function titleCase(value) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function compactList(items, maxItems = 8) {
  if (items.length <= maxItems) return items;
  return [...items.slice(0, maxItems), `... ${items.length - maxItems} more`];
}

function hasToken(rel, token) {
  return rel.toLowerCase().includes(token.toLowerCase());
}

const featureCatalog = [
  {
    id: 'auth-access',
    name: 'Auth, Access, and App Entry',
    roles: 'all users',
    priority: 'foundation',
    match: ['src/pages/auth/', 'protectedroute', 'authprovider', 'authcontext', 'useauthsession', 'homerirect', 'homeredirect', 'notfoundpage', 'databasependingpage'],
    responsibilities: ['login and signup shells', 'protected routes', 'session provider', 'unauthorized and setup states'],
    targetFiles: ['pages/LoginPage.tsx', 'components/AuthShell.tsx', 'hooks/useAuthSession.ts', 'api/authApi.ts', 'types.ts'],
  },
  {
    id: 'platform-admin',
    name: 'XO Platform Admin',
    roles: 'xo_super_admin',
    priority: 'core product',
    match: ['src/pages/xo-admin/', 'usexoadmin', 'usexopayment', 'useplatformanalytics', 'usenurseries', 'usenurseriesanalytics', 'usenurserydetail', 'components/nurseries/', 'tenant-export'],
    responsibilities: ['nursery CRUD', 'platform analytics', 'XO payments', 'tenant export overview'],
    targetFiles: ['pages/XoAdminHomePage.tsx', 'pages/NurseryListPage.tsx', 'components/NurseryForm.tsx', 'hooks/useNurseries.ts', 'api/platformAdminApi.ts'],
  },
  {
    id: 'tenant-settings-rbac',
    name: 'Tenant Settings and RBAC',
    roles: 'xo admin, admins, managers',
    priority: 'foundation',
    match: ['src/pages/admin/settings/', 'adminsettingspage', 'lib/permissions/', 'useroles', 'usepositions', 'usefeatures', 'usepermissions', 'usepermissionmatrix', 'useviewermanagedpositions', 'components/admin/settings/', 'permissiongate', 'actiongate'],
    responsibilities: ['roles', 'positions', 'feature matrix', 'nursery settings', 'tenant export card'],
    targetFiles: ['pages/RolesPage.tsx', 'pages/PositionsPage.tsx', 'pages/FeaturesPage.tsx', 'components/PermissionMatrix.tsx', 'api/rbacApi.ts'],
  },
  {
    id: 'admin-dashboard',
    name: 'Admin Dashboard and Analytics',
    roles: 'admin, manager',
    priority: 'core product',
    match: ['dashboard.tsx', 'admindashboard', 'dashboardquickactions', 'dashboardminicharts', 'dashboardalertsbar', 'useadmindashboard', 'useadminattendanceanalytics', 'attendanceanalytics', 'parentdashboardformat'],
    responsibilities: ['admin home', 'stats cards', 'activity feed', 'alerts', 'mini charts'],
    targetFiles: ['pages/AdminDashboardPage.tsx', 'components/DashboardStatCards.tsx', 'components/ActivityFeed.tsx', 'hooks/useDashboardStats.ts', 'api/dashboardApi.ts'],
  },
  {
    id: 'nursery-onboarding',
    name: 'Nursery Setup Onboarding',
    roles: 'admin, manager',
    priority: 'core product',
    match: ['src/pages/admin/onboarding/', 'onboardingwelcomepage', 'onboardingdatebounds', 'onboarding_self_bootstrap', 'onboarding_extensions'],
    responsibilities: ['branch setup', 'hours', 'classes', 'invite teacher', 'completion flow'],
    targetFiles: ['pages/OnboardingWelcomePage.tsx', 'pages/steps/*.tsx', 'components/OnboardingFrame.tsx', 'api/onboardingApi.ts', 'schemas/onboardingSchema.ts'],
  },
  {
    id: 'children-profiles',
    name: 'Children and Profiles',
    roles: 'admin, parent',
    priority: 'core product',
    match: ['adminchildren', 'adminchildrecord', 'parentchildprofile', 'childselector', 'parentchildsummary', 'useparentdashboardchildren', 'usenurserychildrenpicker', 'children_missing_profile', 'child_extended', 'childavatar'],
    responsibilities: ['child list', 'child record', 'parent child profile', 'avatar upload', 'child summary cards'],
    targetFiles: ['pages/ChildrenListPage.tsx', 'pages/ChildRecordPage.tsx', 'components/ChildSelector.tsx', 'hooks/useChildren.ts', 'api/childrenApi.ts'],
  },
  {
    id: 'child-enrollment',
    name: 'Child Enrollment',
    roles: 'admin, parent',
    priority: 'core workflow',
    match: ['child-enrollment', 'adminchildenrollment', 'child-enrollment-complete', 'submitchildenrollment', 'uploadchildenrollment'],
    responsibilities: ['multi-step child enrollment', 'document uploads', 'validation', 'submit flow', 'completion edge function'],
    targetFiles: ['pages/AdminChildEnrollmentPage.tsx', 'components/ChildEnrollmentWizard.tsx', 'steps/*.tsx', 'schemas/childEnrollmentSchema.ts', 'api/childEnrollmentApi.ts'],
  },
  {
    id: 'parent-signup',
    name: 'Parent Signup',
    roles: 'public, parent',
    priority: 'core workflow',
    match: ['parent-signup', 'parentsignup', 'signupsuccess', 'parent-signup-complete', 'signupstep', 'signupshell', 'signup/filedropzone'],
    responsibilities: ['public parent registration', 'file uploads', 'form validation', 'signup completion edge function'],
    targetFiles: ['pages/ParentSignUpPage.tsx', 'components/SignupShell.tsx', 'components/steps/*.tsx', 'schemas/parentSignUpSchema.ts', 'api/parentSignUpApi.ts'],
  },
  {
    id: 'admissions-applications',
    name: 'Admissions, Inquiries, Applications',
    roles: 'public, admin, parent',
    priority: 'core workflow',
    match: ['admissions', 'inquiries', 'inquiry', 'waitlist', 'applications', 'application', 'publicinquiry', 'applicationdocuments'],
    responsibilities: ['public inquiry form', 'inquiry kanban', 'waitlist', 'applications', 'application review'],
    targetFiles: ['pages/InquiriesPage.tsx', 'pages/ApplicationsPage.tsx', 'components/InquiryKanban.tsx', 'components/ApplicationReviewTabs.tsx', 'api/admissionsApi.ts'],
  },
  {
    id: 'bulk-import',
    name: 'Bulk Import and Spreadsheet Mapping',
    roles: 'admin, operations',
    priority: 'operations',
    match: ['import', 'columnmapper', 'csvparser', 'importvalidator', 'process-import', 'ai-import-mapper', 'spreadsheet'],
    responsibilities: ['child import wizard', 'column mapping', 'validation', 'AI import mapper', 'background processor'],
    targetFiles: ['pages/ImportChildrenPage.tsx', 'components/ImportWizard.tsx', 'components/ColumnMapper.tsx', 'api/importApi.ts', 'validators/importValidator.ts'],
  },
  {
    id: 'attendance',
    name: 'Attendance',
    roles: 'admin, teacher, parent',
    priority: 'core workflow',
    match: ['attendance', 'teacherattendancetoggle', 'attendancedailybars', 'attendanceclassbars', 'attendanceanalytics'],
    responsibilities: ['child attendance', 'teacher attendance toggle', 'attendance dashboard', 'parent history'],
    targetFiles: ['pages/AdminAttendancePage.tsx', 'pages/TeacherAttendancePage.tsx', 'components/AttendanceDailyBars.tsx', 'hooks/useAttendance.ts', 'api/attendanceApi.ts'],
  },
  {
    id: 'classes',
    name: 'Classes and Class Staff',
    roles: 'admin, manager, teacher',
    priority: 'core product',
    match: ['classes', 'classdetail', 'classannouncements', 'classstaff', 'set_class_lead', 'classviewdialog'],
    responsibilities: ['class list/detail', 'class staff assignments', 'class announcements', 'teacher class hub'],
    targetFiles: ['pages/ClassesListPage.tsx', 'pages/ClassDetailPage.tsx', 'components/ClassStaffEditor.tsx', 'hooks/useClassStaff.ts', 'api/classesApi.ts'],
  },
  {
    id: 'courses',
    name: 'Courses',
    roles: 'admin, teacher, parent',
    priority: 'product',
    match: ['course', 'courses'],
    responsibilities: ['course CRUD', 'teacher courses', 'parent course view', 'enrollments'],
    targetFiles: ['pages/CoursesListPage.tsx', 'pages/CourseFormPage.tsx', 'components/CourseCard.tsx', 'hooks/useCourses.ts', 'api/coursesApi.ts'],
  },
  {
    id: 'events-permissions',
    name: 'Events and Permissions',
    roles: 'admin, parent, teacher',
    priority: 'core workflow',
    match: ['event', 'permission', 'permissions', 'parentpermissioncard', 'parentpermissionspage', 'eventform', 'eventtargetselector', 'eventqr'],
    responsibilities: ['event CRUD', 'target children/classes', 'parent permission responses', 'urgent events', 'event attendance QR'],
    targetFiles: ['pages/EventsListPage.tsx', 'pages/EventDetailsPage.tsx', 'components/EventFormFields.tsx', 'hooks/useEventPermissions.ts', 'api/eventsApi.ts'],
  },
  {
    id: 'invoices-payments',
    name: 'Invoices and Payments',
    roles: 'admin, parent, xo admin',
    priority: 'financial',
    match: ['invoice', 'payment', 'paymob', 'paymentattempts', 'submitinvoicepayment', 'payment-reminders'],
    responsibilities: ['invoice CRUD', 'parent payments', 'payment attempts', 'Paymob initiation', 'reminders'],
    targetFiles: ['pages/InvoicesPage.tsx', 'pages/InvoiceDetailsPage.tsx', 'components/InvoiceCard.tsx', 'hooks/useInvoices.ts', 'api/paymentsApi.ts'],
  },
  {
    id: 'financial-reports',
    name: 'Financial Dashboard and Reports',
    roles: 'admin, finance manager, xo admin',
    priority: 'financial',
    match: ['financial', 'revenuechart', 'paymentmethodschart', 'invoicestatuschart', 'invoicetypeschart', 'financialdashboard', 'financialreports'],
    responsibilities: ['financial dashboard', 'revenue charts', 'invoice status charts', 'payment method analytics', 'top parents'],
    targetFiles: ['pages/FinancialDashboardPage.tsx', 'components/FinancialMonthlyRevenueChart.tsx', 'components/InvoiceStatusChart.tsx', 'hooks/useFinancialReports.ts', 'api/financeApi.ts'],
  },
  {
    id: 'staff-hr',
    name: 'Staff and HR',
    roles: 'admin, HR manager',
    priority: 'operations',
    match: ['staffdirectory', 'stafflist', 'staffprofile', 'staffattendance', 'staffschedule', 'staffavatar', 'staffnationalid', 'staffidentity', 'staff_profiles', 'workschedule'],
    responsibilities: ['staff directory', 'staff profiles', 'documents', 'schedules', 'identity checks', 'HR policies'],
    targetFiles: ['pages/StaffDirectoryPage.tsx', 'pages/StaffProfilePage.tsx', 'components/StaffDirectoryTable.tsx', 'hooks/useStaff.ts', 'api/staffApi.ts'],
  },
  {
    id: 'staff-onboarding',
    name: 'Staff Onboarding',
    roles: 'admin, HR manager',
    priority: 'core workflow',
    match: ['staff-onboarding', 'adminstaffonboarding', 'staff-onboarding-complete'],
    responsibilities: ['staff onboarding wizard', 'documents', 'draft persistence', 'profile mapping', 'completion edge function'],
    targetFiles: ['pages/AdminStaffOnboardingPage.tsx', 'components/StaffOnboardingWizard.tsx', 'steps/*.tsx', 'schemas/staffOnboardingSchema.ts', 'api/staffOnboardingApi.ts'],
  },
  {
    id: 'payroll-payslips',
    name: 'Payroll and Payslips',
    roles: 'admin, HR/finance, staff',
    priority: 'financial',
    match: ['payroll', 'payslip', 'staffpayslip'],
    responsibilities: ['payroll records', 'payslip create page', 'staff payslip portal', 'payroll history'],
    targetFiles: ['pages/PayrollPage.tsx', 'pages/PayslipCreatePage.tsx', 'components/PayslipForm.tsx', 'hooks/usePayroll.ts', 'api/payrollApi.ts'],
  },
  {
    id: 'media-gallery',
    name: 'Media Upload, Approval, and Gallery',
    roles: 'admin, teacher, parent',
    priority: 'content',
    match: ['media', 'photo', 'imagecompression', 'mediaactivity', 'mediaapproval', 'mediadownload', 'mediastorage'],
    responsibilities: ['media upload', 'teacher media list', 'approval queue', 'parent gallery', 'downloads and privacy'],
    targetFiles: ['pages/MediaGalleryPage.tsx', 'pages/MediaUploadPage.tsx', 'components/MediaApprovalGrid.tsx', 'hooks/useMedia.ts', 'api/mediaApi.ts'],
  },
  {
    id: 'daily-reports',
    name: 'Daily Reports',
    roles: 'teacher, parent, admin',
    priority: 'core workflow',
    match: ['dailyreport', 'daily_report', 'reportreaction', 'todaysreport', 'parentreports', 'dailyreportdisplay', 'feedingsection', 'toiletsection', 'napsection', 'moodsection', 'activitiessection'],
    responsibilities: ['teacher daily report editor', 'activity/feeding/nap/toilet/mood sections', 'parent report view', 'reactions'],
    targetFiles: ['pages/DailyReportsPage.tsx', 'pages/DailyReportEditorPage.tsx', 'components/DailyReportForm.tsx', 'hooks/useDailyReports.ts', 'api/dailyReportsApi.ts'],
  },
  {
    id: 'milestones-reports',
    name: 'Milestones and Quarterly Reports',
    roles: 'teacher, parent, admin',
    priority: 'learning',
    match: ['milestone', 'quarterly'],
    responsibilities: ['milestone recording', 'milestone cards', 'share cards', 'quarterly reports'],
    targetFiles: ['pages/MilestonesPage.tsx', 'pages/MilestoneRecordPage.tsx', 'components/MilestoneCard.tsx', 'hooks/useMilestones.ts', 'api/milestonesApi.ts'],
  },
  {
    id: 'health-safety',
    name: 'Health and Safety',
    roles: 'admin, parent, teacher',
    priority: 'safety',
    match: ['health', 'allergy', 'allergies', 'medication', 'vaccination', 'condition', 'child_health'],
    responsibilities: ['child health profile', 'allergies', 'conditions', 'medications', 'vaccinations', 'documents', 'health alerts'],
    targetFiles: ['pages/ChildHealthPage.tsx', 'components/HealthOverviewCard.tsx', 'components/dialogs/*.tsx', 'hooks/useChildHealth.ts', 'api/healthApi.ts'],
  },
  {
    id: 'chat-messages',
    name: 'Chat, Inbox, and Messages',
    roles: 'all roles',
    priority: 'communication',
    match: ['chat', 'messages', 'inbox', 'conversation', 'webrtc', 'chatmember', 'chat_directory'],
    responsibilities: ['chat panel', 'chat widget', 'participant picker', 'role inboxes', 'message moderation'],
    targetFiles: ['pages/MessagesPage.tsx', 'components/ChatPanel.tsx', 'components/ChatRecipientPicker.tsx', 'hooks/useChat.ts', 'api/chatApi.ts'],
  },
  {
    id: 'broadcast-notifications',
    name: 'Broadcasts and Notifications',
    roles: 'admin, teacher, parent',
    priority: 'communication',
    match: ['broadcast', 'notification', 'push', 'email-dispatch', 'sms-dispatch', 'whatsapp-dispatch', 'emergency-broadcast', 'permission-deadline-reminder', 'payment-reminders', 'reminderalert'],
    responsibilities: ['broadcast composer/history', 'notification center', 'push setup', 'email/SMS/WhatsApp dispatch', 'urgent broadcasts'],
    targetFiles: ['pages/BroadcastMessagePage.tsx', 'components/BroadcastPreviewDialog.tsx', 'components/NotificationCenterDrawer.tsx', 'hooks/useNotifications.ts', 'api/notificationsApi.ts'],
  },
  {
    id: 'surveys-forms',
    name: 'Surveys and Dynamic Forms',
    roles: 'admin, parent',
    priority: 'engagement',
    match: ['survey', 'surveys', 'formbuilder', 'formrenderer'],
    responsibilities: ['survey builder', 'form renderer', 'responses', 'analytics panel', 'survey notifications'],
    targetFiles: ['pages/SurveysPage.tsx', 'components/FormBuilder.tsx', 'components/FormRenderer.tsx', 'hooks/useSurveys.ts', 'api/surveysApi.ts'],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    roles: 'admin, manager',
    priority: 'operations',
    match: ['inventory'],
    responsibilities: ['inventory page', 'inventory hooks', 'stock tables'],
    targetFiles: ['pages/InventoryPage.tsx', 'components/InventoryTable.tsx', 'hooks/useInventory.ts', 'api/inventoryApi.ts', 'types.ts'],
  },
  {
    id: 'meals-nutrition',
    name: 'Meals and Nutrition',
    roles: 'admin, parent, teacher',
    priority: 'care',
    match: ['meal', 'meals', 'feeding'],
    responsibilities: ['meal plans', 'parent meals page', 'teacher feeding section', 'nutrition records'],
    targetFiles: ['pages/MealPlansPage.tsx', 'pages/ParentMealsPage.tsx', 'components/MealsSection.tsx', 'hooks/useMealPlans.ts', 'api/mealsApi.ts'],
  },
  {
    id: 'loyalty-rewards-packages',
    name: 'Loyalty, Rewards, and Packages',
    roles: 'admin, parent, finance',
    priority: 'engagement',
    match: ['loyalty', 'reward', 'points', 'package', 'packages'],
    responsibilities: ['loyalty points', 'parent rewards page', 'redemption widget', 'admin packages'],
    targetFiles: ['pages/LoyaltyPage.tsx', 'pages/RewardsPage.tsx', 'components/LoyaltyDashboard.tsx', 'hooks/useLoyalty.ts', 'api/loyaltyApi.ts'],
  },
  {
    id: 'qr-pickup-checkin',
    name: 'QR, Pickup, and Check-in',
    roles: 'admin, teacher, parent',
    priority: 'safety',
    match: ['qr', 'pickup', 'scanner', 'verify', 'delegatepickup'],
    responsibilities: ['child QR codes', 'delegate pickup QR', 'scanner', 'pickup identity confirmation', 'QR verification edge function'],
    targetFiles: ['pages/QRCodesPage.tsx', 'pages/QRScannerPage.tsx', 'components/ChildQrCodeCard.tsx', 'hooks/useQrTokens.ts', 'api/qrApi.ts'],
  },
  {
    id: 'community-content',
    name: 'Community and Content Library',
    roles: 'admin, teacher, parent',
    priority: 'content',
    match: ['community', 'library', 'content'],
    responsibilities: ['community pages', 'content library', 'admin/teacher/parent views'],
    targetFiles: ['pages/CommunityPage.tsx', 'pages/ContentLibraryPage.tsx', 'components/ContentCard.tsx', 'hooks/useContentLibrary.ts', 'api/contentApi.ts'],
  },
  {
    id: 'personal-reminders',
    name: 'Personal and Teacher Reminders',
    roles: 'admin, teacher, parent',
    priority: 'communication',
    match: ['reminder', 'reminders', 'teacherreminders', 'personal_reminders'],
    responsibilities: ['personal reminders', 'teacher reminders', 'repeat flags', 'alert host'],
    targetFiles: ['pages/RemindersPage.tsx', 'pages/TeacherRemindersPage.tsx', 'components/ReminderAlertHost.tsx', 'hooks/usePersonalReminders.ts', 'api/remindersApi.ts'],
  },
  {
    id: 'ai-help',
    name: 'AI Assistant and Help Center',
    roles: 'all roles',
    priority: 'support',
    match: ['ai', 'help', 'helpai', 'helparticle'],
    responsibilities: ['help articles', 'AI assistant panel', 'AI action safety dialog', 'AI context and tools', 'route tracker'],
    targetFiles: ['pages/HelpAiPreferencesPage.tsx', 'components/HelpPanel.tsx', 'components/AIAssistant.tsx', 'hooks/useAiAssistant.ts', 'api/aiAssistantApi.ts'],
  },
  {
    id: 'pwa-i18n-theme',
    name: 'PWA, Offline, I18n, and Theme',
    roles: 'all roles',
    priority: 'platform',
    match: ['pwa', 'offline', 'serviceworker', 'sw.js', 'manifest', 'i18n', 'locales', 'theme', 'language', 'rtl'],
    responsibilities: ['service worker', 'install prompt', 'offline queue/indicator', 'Arabic/English locales', 'theme switching'],
    targetFiles: ['src/app/i18n.ts', 'src/app/pwa/*.ts', 'src/shared/theme/*.tsx', 'src/locales/*.json', 'src/shared/offline/*.tsx'],
  },
  {
    id: 'ops-backup-export',
    name: 'Ops, Backup, Export, and Integrity',
    roles: 'ops, admins',
    priority: 'operations',
    match: ['ops', 'backup', 'restore', 'integrity', 'export', 'usage', 'incident', 'runbook', 'databasehealth', 'tenant-export'],
    responsibilities: ['tenant exports', 'backup/recovery docs', 'usage watch', 'restore rehearsal', 'integrity checks', 'incident runbook'],
    targetFiles: ['scripts/ops/*.mjs', 'docs/backup-and-recovery.md', 'docs/incident-runbook.md', 'src/features/ops/api/exportsApi.ts', 'src/features/ops/components/TenantExportCard.tsx'],
  },
];

const files = walk(root);
const relFiles = files.map((file) => toPosix(path.relative(root, file)));
const sourceFiles = files.filter((file) => sourceExts.has(path.extname(file).toLowerCase()));
const routerText = safeRead('src/router/AppRouter.tsx');
const packageJson = JSON.parse(safeRead('package.json'));

const routeMatches = [...routerText.matchAll(/<Route\s+(?:index|path=)/g)];
const currentArchitectureRows = groupCount(relFiles, countLayer)
  .filter((item) => item.value > 0)
  .map((item) => [item.label, item.value.toLocaleString()]);

const lineRows = groupCount(sourceFiles, (file) => {
  const rel = toPosix(path.relative(root, file));
  return countLayer(rel);
})
  .map((item) => {
    const matching = sourceFiles.filter((file) => countLayer(toPosix(path.relative(root, file))) === item.label);
    const lines = matching.reduce((sum, file) => sum + getLineCount(file), 0);
    return [item.label, item.value.toLocaleString(), lines.toLocaleString()];
  });

const featureDetails = featureCatalog.map((feature) => {
  const matches = relFiles.filter((rel) => feature.match.some((token) => hasToken(rel, token)));
  const layers = groupCount(matches, countLayer);
  const routeCount = matches.filter((rel) => rel.startsWith('src/pages/') && rel.endsWith('.tsx')).length;
  const edgeFunctions = matches
    .filter((rel) => rel.startsWith('supabase/functions/') && rel.endsWith('index.ts'))
    .map((rel) => rel.split('/')[2])
    .filter(Boolean);
  return {
    ...feature,
    files: matches.sort(),
    routeCount,
    layers,
    edgeFunctions: [...new Set(edgeFunctions)].sort(),
  };
});

const uncovered = relFiles
  .filter((rel) => rel.startsWith('src/pages/') || rel.startsWith('src/hooks/') || rel.startsWith('src/lib/') || rel.startsWith('src/components/'))
  .filter((rel) => !featureDetails.some((feature) => feature.files.includes(rel)))
  .sort();

const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 42;
const contentWidth = pageWidth - margin * 2;

const colors = {
  ink: [25, 34, 48],
  muted: [91, 107, 128],
  border: [218, 226, 238],
  panel: [248, 250, 253],
  blue: [37, 99, 235],
  green: [22, 163, 74],
  amber: [217, 119, 6],
  red: [220, 38, 38],
  purple: [124, 58, 237],
  teal: [15, 118, 110],
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
  doc.setDrawColor(...colors.blue);
  doc.setLineWidth(2);
  doc.line(margin, y + 8, margin + 44, y + 8);
  if (subtitle) {
    setText(colors.muted, 9);
    doc.text(doc.splitTextToSize(subtitle, contentWidth), margin, y + 24);
    return y + 48;
  }
  return y + 26;
}

function card(x, y, w, h, title, value, note, accent = colors.blue) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 6, h, 3, 3, 'F');
  setText(colors.muted, 8, 'bold');
  doc.text(title.toUpperCase(), x + 16, y + 18);
  setText(colors.ink, 21, 'bold');
  doc.text(String(value), x + 16, y + 43);
  setText(colors.muted, 7.8);
  doc.text(doc.splitTextToSize(note, w - 24), x + 16, y + 59);
}

function table(head, body, startY, options = {}) {
  autoTable(doc, {
    head: [head],
    body,
    startY,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: options.fontSize ?? 7.4,
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
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: margin, right: margin },
    tableWidth: options.tableWidth ?? contentWidth,
    columnStyles: options.columnStyles ?? {},
  });
  return doc.lastAutoTable.finalY + 16;
}

function drawBarChart(x, y, w, h, rows, options = {}) {
  const data = rows.filter((item) => item.value > 0);
  const max = Math.max(...data.map((item) => item.value), 1);
  const labelW = options.labelWidth ?? 132;
  const rowH = h / Math.max(data.length, 1);
  const barW = w - labelW - 38;
  data.forEach((item, index) => {
    const rowY = y + index * rowH + 3;
    setText(colors.slate, 7.5);
    doc.text(doc.splitTextToSize(item.label, labelW - 4), x, rowY + 9);
    doc.setFillColor(234, 240, 248);
    doc.roundedRect(x + labelW, rowY, barW, 9, 4, 4, 'F');
    const fill = [colors.blue, colors.green, colors.amber, colors.purple, colors.teal, colors.slate][index % 6];
    doc.setFillColor(...fill);
    doc.roundedRect(x + labelW, rowY, Math.max(2, (item.value / max) * barW), 9, 4, 4, 'F');
    setText(colors.muted, 7.5, 'bold');
    doc.text(String(item.value), x + labelW + barW + 7, rowY + 8);
  });
}

function drawLayerDiagram(x, y, w) {
  const levels = [
    ['src/app', 'router, providers, layouts, global shell'],
    ['src/features/*', 'business slices: pages, components, hooks, api, schemas'],
    ['src/shared/*', 'UI primitives, small hooks, pure utilities'],
    ['src/backend/* + supabase', 'generated DB types, edge functions, migrations'],
  ];
  const boxH = 52;
  levels.forEach((level, index) => {
    const yy = y + index * (boxH + 12);
    doc.setDrawColor(...colors.border);
    doc.setFillColor(index === 1 ? 239 : 255, index === 1 ? 246 : 255, index === 1 ? 255 : 255);
    doc.roundedRect(x, yy, w, boxH, 8, 8, 'FD');
    doc.setFillColor(...[colors.blue, colors.green, colors.purple, colors.amber][index]);
    doc.roundedRect(x, yy, 7, boxH, 3, 3, 'F');
    setText(colors.ink, 12, 'bold');
    doc.text(level[0], x + 18, yy + 21);
    setText(colors.muted, 8.5);
    doc.text(level[1], x + 18, yy + 37);
    if (index < levels.length - 1) {
      doc.setDrawColor(...colors.muted);
      doc.line(x + w / 2, yy + boxH + 2, x + w / 2, yy + boxH + 10);
      doc.triangle(x + w / 2 - 3, yy + boxH + 9, x + w / 2 + 3, yy + boxH + 9, x + w / 2, yy + boxH + 14, 'F');
    }
  });
}

function drawTree(x, y, lines, lineHeight = 10.5) {
  setText(colors.slate, 7.8, 'normal', 'courier');
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * lineHeight);
  });
  doc.setFont('helvetica', 'normal');
}

function featureFolderTree(feature) {
  const id = feature.id;
  return [
    `src/features/${id}/`,
    '  pages/',
    '  components/',
    '  hooks/',
    '  api/',
    '  schemas/',
    '  types.ts',
    '  index.ts',
    '  __tests__/',
  ];
}

function drawFeatureCard(feature, x, y, w, h) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...(feature.priority === 'foundation' ? colors.purple : feature.priority === 'financial' ? colors.amber : feature.priority === 'safety' ? colors.red : colors.blue));
  doc.rect(x, y, w, 5, 'F');

  setText(colors.ink, 11.5, 'bold');
  doc.text(feature.name, x + 10, y + 22);
  setText(colors.muted, 7.4, 'bold');
  doc.text(`Roles: ${feature.roles} | Current matched files: ${feature.files.length} | Pages: ${feature.routeCount}`, x + 10, y + 36);

  setText(colors.ink, 8, 'bold');
  doc.text('Responsibility', x + 10, y + 53);
  setText(colors.muted, 7.2);
  doc.text(doc.splitTextToSize(feature.responsibilities.join('; '), w - 20), x + 10, y + 65);

  const middleY = y + 95;
  setText(colors.ink, 8, 'bold');
  doc.text('Target feature structure', x + 10, middleY);
  drawTree(x + 10, middleY + 13, featureFolderTree(feature), 9.2);

  setText(colors.ink, 8, 'bold');
  doc.text('Suggested first files', x + w / 2 + 6, middleY);
  setText(colors.muted, 7.1);
  doc.text(doc.splitTextToSize(feature.targetFiles.join('\n'), w / 2 - 18), x + w / 2 + 6, middleY + 13);

  setText(colors.ink, 8, 'bold');
  doc.text('Current scattered examples', x + 10, y + h - 62);
  setText(colors.muted, 6.6);
  const examples = compactList(feature.files.filter((rel) => !rel.startsWith('supabase/migrations/')), 5).map(displayPath);
  doc.text(doc.splitTextToSize(examples.length ? examples.join('\n') : 'No direct current file match found by name.', w - 20), x + 10, y + h - 50);
}

function addFooters() {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...colors.border);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    setText(colors.muted, 7);
    doc.text(`XO Platform maintainable structure plan - generated ${generatedAtLabel}`, margin, pageHeight - 20);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin - 48, pageHeight - 20);
  }
}

// Cover
doc.setFillColor(248, 250, 252);
doc.rect(0, 0, pageWidth, pageHeight, 'F');
doc.setFillColor(...colors.slate);
doc.rect(0, 0, pageWidth, 166, 'F');
setText([255, 255, 255], 29, 'bold');
doc.text('XO Platform', margin, 70);
setText([224, 231, 241], 16, 'bold');
doc.text('Maintainable Project Structure and Feature Slices', margin, 100);
setText([224, 231, 241], 10);
doc.text(`Generated from local repository on ${generatedAtLabel}`, margin, 124);

card(margin, 204, 118, 86, 'Features', featureCatalog.length, 'Feature slices documented.', colors.blue);
card(margin + 132, 204, 118, 86, 'Routes', routeMatches.length, 'React Router declarations.', colors.green);
card(margin + 264, 204, 118, 86, 'Source files', sourceFiles.length, 'Text/code files scanned.', colors.purple);
card(margin + 396, 204, 118, 86, 'Unmapped', uncovered.length, 'Files outside feature matching.', colors.amber);

let y = 332;
setText(colors.ink, 15, 'bold');
doc.text('Goal', margin, y);
y += 22;
setText(colors.muted, 10);
doc.text(
  doc.splitTextToSize(
    'This PDF shows how to update the code structure so the project becomes easier to maintain, read, test, and grow. The recommended direction is feature-sliced architecture: app shell code stays in one place, shared primitives stay small, and every business capability owns its pages, hooks, API calls, components, schemas, and tests.',
    contentWidth,
  ),
  margin,
  y,
);
y += 82;
drawLayerDiagram(margin, y, contentWidth);

// Current shape
addPage();
y = sectionTitle('Current Structure Diagnosis', 58, 'The project already has a strong product surface, but the code is split by role pages and global folders. That makes feature changes harder because one workflow can live across pages, hooks, lib modules, components, migrations, and edge functions.');
card(margin, y, 118, 78, 'src/pages', relFiles.filter((rel) => rel.startsWith('src/pages/')).length, 'Mostly role-based pages.', colors.blue);
card(margin + 132, y, 118, 78, 'src/hooks', relFiles.filter((rel) => rel.startsWith('src/hooks/')).length, 'Global data hooks.', colors.green);
card(margin + 264, y, 118, 78, 'src/lib', relFiles.filter((rel) => rel.startsWith('src/lib/')).length, 'Business helpers mixed with utilities.', colors.amber);
card(margin + 396, y, 118, 78, 'src/features', relFiles.filter((rel) => rel.startsWith('src/features/')).length, 'Only some workflows are sliced.', colors.purple);
y += 112;
setText(colors.ink, 12, 'bold');
doc.text('Files by Current Layer', margin, y);
y += 12;
drawBarChart(
  margin,
  y,
  contentWidth,
  170,
  groupCount(relFiles, countLayer).slice(0, 12),
  { labelWidth: 128 },
);
y += 204;
y = table(
  ['Current pattern', 'What it causes', 'Clean-code direction'],
  [
    ['Role-first pages', 'Admin, parent, and teacher flows for the same feature are far apart.', 'Move related role pages into the same feature slice under pages/.'],
    ['Global hooks folder', 'Hard to know which feature owns a query or mutation.', 'Move feature-specific hooks beside the feature; keep only generic hooks in shared/hooks.'],
    ['Global lib folder', 'Business logic and generic utilities are mixed.', 'Move domain logic to feature/api or feature/lib; keep only generic helpers in shared/lib.'],
    ['Manual DB types', 'Supabase table drift creates many never-row TypeScript errors.', 'Generate database types and put them under src/backend/supabase.'],
    ['Large route file', 'Router imports every page and becomes a coordination hotspot.', 'Keep route definitions in src/app/router and import feature route modules.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 125 }, 1: { cellWidth: 190 }, 2: { cellWidth: 195 } }, fontSize: 7.6 },
);

// Target tree
addPage();
y = sectionTitle('Target Project Structure', 58, 'This is the structure to migrate toward. It is still React/Vite/Supabase, but ownership becomes clear because each feature owns its own UI, hooks, API calls, schemas, and tests.');
drawTree(margin, y, [
  'src/',
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
  '      XoAdminLayout.tsx',
  '  features/',
  '    attendance/',
  '    events-permissions/',
  '    invoices-payments/',
  '    staff-onboarding/',
  '    child-enrollment/',
  '    ... one folder per feature',
  '  shared/',
  '    ui/',
  '    components/',
  '    hooks/',
  '    lib/',
  '    types/',
  '  backend/',
  '    supabase/',
  '      client.ts',
  '      generated.types.ts',
  '      queryKeys.ts',
  '  locales/',
  '  assets/',
  'supabase/',
  '  migrations/',
  '  functions/',
  'scripts/',
  'docs/',
], 12);

y = 490;
setText(colors.ink, 12, 'bold');
doc.text('Feature Module Anatomy', margin, y);
y += 14;
y = table(
  ['Folder/file', 'Purpose', 'Rule'],
  [
    ['pages/', 'Route-level screens for all roles that use this feature.', 'Pages compose; they should not contain large data or formatting logic.'],
    ['components/', 'Feature-specific UI pieces.', 'Reusable only inside the feature unless promoted to shared/components.'],
    ['hooks/', 'React Query hooks and UI state hooks.', 'Name by useFeatureThing; no raw Supabase calls in pages.'],
    ['api/', 'Supabase reads/writes and edge-function calls.', 'Typed inputs/outputs; one module per backend capability.'],
    ['schemas/', 'Zod schemas and form validation.', 'Keep form defaults and resolver types beside schemas.'],
    ['types.ts', 'Feature domain types.', 'Prefer generated DB types plus small view models.'],
    ['index.ts', 'Public exports for this feature.', 'Avoid deep imports from other features.'],
    ['__tests__/', 'Unit, hook, or route smoke tests.', 'Test high-risk flows and permission gates.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 95 }, 1: { cellWidth: 195 }, 2: { cellWidth: 220 } }, fontSize: 7.4 },
);

// Migration rules
addPage();
y = sectionTitle('Migration Rules', 58, 'Move gradually. Do not refactor the entire app at once. Pick one feature, make it compile, add a compatibility export if needed, then move to the next feature.');
y = table(
  ['Rule', 'How to apply it'],
  [
    ['Move by feature, not by file type', 'Start with a feature such as events-permissions. Move its pages, hooks, components, and lib helpers together.'],
    ['Keep imports stable during migration', 'Create feature index.ts exports and update imports in small batches.'],
    ['Keep shared small', 'Only put primitives and generic utilities in shared. If code mentions invoices, attendance, events, child, staff, media, or nursery, it belongs to a feature.'],
    ['Make pages thin', 'A page should load route params, call feature hooks, and compose components. Business decisions go into hooks/api/lib.'],
    ['Centralize API contracts', 'Supabase calls and edge function calls live in feature/api. Return typed view models to components.'],
    ['Generate DB types', 'Move database.ts to generated.types.ts and regenerate after migrations. This removes stale table/type drift.'],
    ['Protect boundaries', 'Features may import shared and backend. Features should not deep-import each other; use public feature APIs only.'],
    ['Test after each slice', 'Run typecheck/lint after each migrated feature. Add route smoke tests for role pages.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 360 } }, fontSize: 7.8 },
);
y = doc.lastAutoTable.finalY + 16;
setText(colors.ink, 12, 'bold');
doc.text('Recommended Migration Order', margin, y);
y += 14;
y = table(
  ['Wave', 'Features', 'Why first'],
  [
    ['1', 'auth-access, app router, layouts, backend/supabase generated types', 'These unblock type safety and reduce routing/layout breakage.'],
    ['2', 'events-permissions, invoices-payments, attendance, staff-onboarding, child-enrollment', 'These are high-change core workflows with scattered files.'],
    ['3', 'children-profiles, admissions, staff-hr, payroll, health-safety', 'Operational features depend on stable core and generated DB types.'],
    ['4', 'media, daily-reports, milestones, courses, classes, surveys', 'Content and learning flows become easier once feature boundaries are normal.'],
    ['5', 'AI/help, notifications, PWA/i18n/theme, ops', 'Cross-cutting platform features can be cleaned after domain slices are clear.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 250 }, 2: { cellWidth: 210 } }, fontSize: 7.6 },
);

// Summary table
addPage();
y = sectionTitle('Feature Slice Summary', 58, 'Every major feature detected in the current codebase, with its intended target folder. Detailed structures follow in the next pages.');
y = table(
  ['Feature', 'Target folder', 'Roles', 'Matched files'],
  featureDetails.map((feature) => [
    feature.name,
    `src/features/${feature.id}`,
    feature.roles,
    String(feature.files.length),
  ]),
  y,
  { columnStyles: { 0: { cellWidth: 170 }, 1: { cellWidth: 170 }, 2: { cellWidth: 120 }, 3: { cellWidth: 50 } }, fontSize: 6.8 },
);

// Feature cards, two per page.
for (let index = 0; index < featureDetails.length; index += 2) {
  addPage();
  y = sectionTitle('Feature Structures', 58, `Target folder layout and current scattered examples for features ${index + 1}-${Math.min(index + 2, featureDetails.length)}.`);
  drawFeatureCard(featureDetails[index], margin, y, contentWidth, 280);
  if (featureDetails[index + 1]) {
    drawFeatureCard(featureDetails[index + 1], margin, y + 304, contentWidth, 280);
  }
}

// Appendix
addPage();
y = sectionTitle('Appendix', 58, 'Extra repository statistics and unmapped files. Unmapped does not always mean wrong; it means the file is probably shared, infrastructural, or needs manual ownership.');
y = table(
  ['Stack item', 'Detected value'],
  [
    ['Package', packageJson.name],
    ['React', packageJson.dependencies.react],
    ['Router', packageJson.dependencies['react-router-dom']],
    ['Data fetching', packageJson.dependencies['@tanstack/react-query']],
    ['Supabase client', packageJson.dependencies['@supabase/supabase-js']],
    ['Validation', packageJson.dependencies.zod],
    ['Forms', packageJson.dependencies['react-hook-form']],
    ['Charts', packageJson.dependencies.recharts],
    ['PDF generator', `${packageJson.dependencies.jspdf} + ${packageJson.dependencies['jspdf-autotable']}`],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 350 } }, fontSize: 7.7 },
);
y = doc.lastAutoTable.finalY + 14;
setText(colors.ink, 12, 'bold');
doc.text('Source Files by Layer and Lines', margin, y);
y += 12;
y = table(
  ['Layer', 'Files', 'Lines'],
  lineRows,
  y,
  { columnStyles: { 0: { cellWidth: 190 }, 1: { cellWidth: 90 }, 2: { cellWidth: 110 } }, fontSize: 7.2 },
);
setText(colors.ink, 12, 'bold');
doc.text('Unmapped Examples to Review', margin, y);
y += 12;
table(
  ['File', 'Likely decision'],
  compactList(uncovered, 28).map((rel) => [
    displayPath(rel),
    rel.startsWith('src/components/ui/')
      ? 'Keep in shared/ui.'
      : rel.startsWith('src/components/layout')
        ? 'Move to src/app/layouts.'
        : rel.startsWith('src/router/')
          ? 'Move to src/app/router.'
          : rel.startsWith('src/types/')
            ? 'Keep generated/global types under src/backend or shared/types.'
            : 'Assign to feature or shared during migration.',
  ]),
  y,
  { columnStyles: { 0: { cellWidth: 310 }, 1: { cellWidth: 200 } }, fontSize: 6.8 },
);

addFooters();

fs.mkdirSync(path.dirname(docsOutputPath), { recursive: true });
const pdfBytes = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(docsOutputPath, pdfBytes);
fs.writeFileSync(rootOutputPath, pdfBytes);

console.log(`Wrote ${path.relative(root, docsOutputPath)}`);
console.log(`Wrote ${path.relative(root, rootOutputPath)}`);
