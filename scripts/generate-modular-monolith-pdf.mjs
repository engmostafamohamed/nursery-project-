import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const docsOutputPath = path.join(root, 'docs', 'xo-platform-modular-monolith-vertical-slices.pdf');
const rootOutputPath = path.join(root, 'project-modular-monolith-vertical-slices.pdf');
const generatedAt = new Date().toISOString().slice(0, 10);

const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'attached_assets']);
const textExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css', '.html', '.md', '.sql', '.toml']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function safeRead(relPath) {
  const fullPath = path.join(root, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function countLines(file) {
  if (!textExts.has(path.extname(file).toLowerCase())) return 0;
  const text = fs.readFileSync(file, 'utf8');
  return text.length ? text.split(/\r?\n/).length : 0;
}

function groupCount(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function layerOf(rel) {
  if (rel.startsWith('src/pages/')) return 'current frontend pages';
  if (rel.startsWith('src/components/')) return 'current frontend components';
  if (rel.startsWith('src/hooks/')) return 'current frontend hooks';
  if (rel.startsWith('src/lib/')) return 'current frontend/domain lib';
  if (rel.startsWith('src/features/')) return 'current feature slices';
  if (rel.startsWith('src/router/')) return 'current router';
  if (rel.startsWith('src/providers/')) return 'current providers';
  if (rel.startsWith('src/types/')) return 'current types';
  if (rel.startsWith('supabase/functions/')) return 'backend edge functions';
  if (rel.startsWith('supabase/migrations/')) return 'backend migrations';
  if (rel.startsWith('scripts/')) return 'scripts';
  if (rel.startsWith('docs/')) return 'docs';
  return 'root/config';
}

const modules = [
  {
    id: 'auth-access',
    name: 'Auth and Access',
    roles: 'all users',
    priority: 'foundation',
    frontend: ['routes for login/signup/unauthorized', 'Auth shell', 'session and route guard hooks'],
    backend: ['Supabase Auth', 'RLS helper functions', 'optional auth callback edge function'],
    shared: ['Role enum', 'auth session types', 'permission subject types'],
    data: ['users', 'staff_profiles', 'parents'],
    edge: ['none required now'],
  },
  {
    id: 'platform-admin',
    name: 'XO Platform Admin',
    roles: 'xo_super_admin',
    priority: 'core',
    frontend: ['XO dashboard pages', 'nursery CRUD screens', 'platform analytics widgets'],
    backend: ['tenant analytics queries', 'nursery management tables', 'tenant export function'],
    shared: ['Nursery DTOs', 'platform analytics types'],
    data: ['nurseries', 'payment_attempts', 'tenant_export_jobs'],
    edge: ['tenant-export'],
  },
  {
    id: 'tenant-settings-rbac',
    name: 'Tenant Settings and RBAC',
    roles: 'xo admin, admin, manager',
    priority: 'foundation',
    frontend: ['roles page', 'positions page', 'features page', 'permission gates'],
    backend: ['roles tables', 'role_features', 'position management policies'],
    shared: ['Feature keys', 'permission matrix', 'can() policy helper'],
    data: ['roles', 'positions', 'features', 'role_features'],
    edge: ['none required now'],
  },
  {
    id: 'admin-dashboard',
    name: 'Admin Dashboard',
    roles: 'admin, manager',
    priority: 'core',
    frontend: ['dashboard page', 'stats cards', 'mini charts', 'activity feed'],
    backend: ['dashboard queries', 'attendance and finance rollups'],
    shared: ['dashboard view models', 'chart metric types'],
    data: ['attendance_records', 'children', 'invoices', 'notifications'],
    edge: ['none required now'],
  },
  {
    id: 'nursery-onboarding',
    name: 'Nursery Setup Onboarding',
    roles: 'admin, manager',
    priority: 'core',
    frontend: ['onboarding steps', 'class setup UI', 'hours setup UI', 'invite teacher UI'],
    backend: ['nursery settings', 'class creation', 'self bootstrap policies'],
    shared: ['onboarding schema', 'working day constants'],
    data: ['nursery_settings', 'classes', 'users'],
    edge: ['none required now'],
  },
  {
    id: 'children-profiles',
    name: 'Children and Profiles',
    roles: 'admin, parent',
    priority: 'core',
    frontend: ['child list', 'child record', 'parent child profile', 'avatar upload'],
    backend: ['children table', 'parent-child relationships', 'avatar storage policies'],
    shared: ['child profile types', 'age/name formatters'],
    data: ['children', 'child_guardians', 'child_avatars'],
    edge: ['none required now'],
  },
  {
    id: 'child-enrollment',
    name: 'Child Enrollment',
    roles: 'admin, parent',
    priority: 'workflow',
    frontend: ['child enrollment wizard', 'step panels', 'document upload UI'],
    backend: ['completion edge function', 'enrollment documents storage', 'application activation'],
    shared: ['child enrollment schema', 'file requirements', 'step validation'],
    data: ['children', 'applications', 'child_documents'],
    edge: ['child-enrollment-complete'],
  },
  {
    id: 'parent-signup',
    name: 'Parent Signup',
    roles: 'public, parent',
    priority: 'workflow',
    frontend: ['signup shell', 'signup steps', 'file dropzone', 'success page'],
    backend: ['parent signup completion', 'parent account creation', 'uploaded documents'],
    shared: ['parent signup schema', 'contact validation'],
    data: ['parents', 'users', 'applications'],
    edge: ['parent-signup-complete'],
  },
  {
    id: 'admissions-applications',
    name: 'Admissions and Applications',
    roles: 'public, admin, parent',
    priority: 'workflow',
    frontend: ['public inquiry form', 'inquiry kanban', 'waitlist', 'application review'],
    backend: ['inquiry/application tables', 'document verification', 'status transitions'],
    shared: ['application status enum', 'inquiry schema'],
    data: ['inquiries', 'waitlist', 'applications', 'application_documents'],
    edge: ['none required now'],
  },
  {
    id: 'bulk-import',
    name: 'Bulk Import',
    roles: 'admin, operations',
    priority: 'ops',
    frontend: ['import wizard', 'column mapper', 'import review/progress pages'],
    backend: ['import jobs', 'AI mapper', 'background import processor'],
    shared: ['import row schema', 'validation result types'],
    data: ['import_jobs', 'children', 'parents'],
    edge: ['ai-import-mapper', 'process-import'],
  },
  {
    id: 'attendance',
    name: 'Attendance',
    roles: 'admin, teacher, parent',
    priority: 'workflow',
    frontend: ['admin attendance pages', 'teacher attendance page', 'parent attendance history'],
    backend: ['attendance records', 'attendance analytics queries', 'teacher toggle logic'],
    shared: ['attendance status enum', 'date range helpers'],
    data: ['attendance_records', 'children', 'classes'],
    edge: ['qr-verify when check-in uses QR'],
  },
  {
    id: 'classes',
    name: 'Classes and Class Staff',
    roles: 'admin, manager, teacher',
    priority: 'core',
    frontend: ['classes list/detail', 'class staff editor', 'class announcements'],
    backend: ['classes table', 'class_staff policies', 'class lead RPC'],
    shared: ['class role types', 'class membership DTOs'],
    data: ['classes', 'class_staff', 'staff_profiles'],
    edge: ['none required now'],
  },
  {
    id: 'courses',
    name: 'Courses',
    roles: 'admin, teacher, parent',
    priority: 'product',
    frontend: ['course list', 'course form', 'teacher courses', 'parent courses'],
    backend: ['course tables', 'enrollment tables', 'teacher/course policies'],
    shared: ['course schema', 'course category enum'],
    data: ['courses', 'course_enrollments', 'children'],
    edge: ['none required now'],
  },
  {
    id: 'events-permissions',
    name: 'Events and Permissions',
    roles: 'admin, parent, teacher',
    priority: 'workflow',
    frontend: ['event list/details/create/edit', 'permission cards', 'event QR cards'],
    backend: ['events', 'event permissions', 'event invoices', 'permission reminders'],
    shared: ['event schema', 'permission status enum', 'targeting types'],
    data: ['events', 'event_permissions', 'event_attendees', 'event_invoices'],
    edge: ['event-qr-issue', 'permission-deadline-reminder'],
  },
  {
    id: 'invoices-payments',
    name: 'Invoices and Payments',
    roles: 'admin, parent, finance',
    priority: 'financial',
    frontend: ['invoice CRUD', 'parent payment pages', 'payment attempt UI'],
    backend: ['invoice tables', 'payment attempts', 'Paymob initiation', 'reminders'],
    shared: ['invoice status enum', 'money formatter', 'payment DTOs'],
    data: ['invoices', 'invoice_line_items', 'payment_attempts'],
    edge: ['payment-reminders'],
  },
  {
    id: 'financial-reports',
    name: 'Financial Reports',
    roles: 'admin, finance, xo admin',
    priority: 'financial',
    frontend: ['financial dashboard', 'revenue chart', 'payment charts', 'top parents'],
    backend: ['finance views/RPCs', 'invoice aggregation', 'payment analytics'],
    shared: ['finance metric types', 'date bucket helpers'],
    data: ['invoices', 'payment_attempts', 'packages'],
    edge: ['none required now'],
  },
  {
    id: 'staff-hr',
    name: 'Staff and HR',
    roles: 'admin, HR manager',
    priority: 'ops',
    frontend: ['staff directory', 'staff profile', 'documents', 'schedule editor'],
    backend: ['staff profiles', 'identity checks', 'HR manager policies'],
    shared: ['staff type enum', 'work schedule schema'],
    data: ['staff_profiles', 'staff_documents', 'staff_schedules'],
    edge: ['none required now'],
  },
  {
    id: 'staff-onboarding',
    name: 'Staff Onboarding',
    roles: 'admin, HR manager',
    priority: 'workflow',
    frontend: ['staff onboarding wizard', 'document uploads', 'draft persistence'],
    backend: ['staff onboarding completion', 'profile mapping', 'document storage'],
    shared: ['staff onboarding schema', 'step error types'],
    data: ['staff_profiles', 'staff_documents', 'users'],
    edge: ['staff-onboarding-complete'],
  },
  {
    id: 'payroll-payslips',
    name: 'Payroll and Payslips',
    roles: 'admin, HR/finance, staff',
    priority: 'financial',
    frontend: ['payroll page', 'payslip create page', 'staff payslip portal'],
    backend: ['payroll records', 'payslip visibility policies'],
    shared: ['payroll record type', 'currency formatters'],
    data: ['staff_payroll_records', 'staff_profiles'],
    edge: ['none required now'],
  },
  {
    id: 'media-gallery',
    name: 'Media Upload and Gallery',
    roles: 'admin, teacher, parent',
    priority: 'content',
    frontend: ['media upload', 'media approval', 'parent gallery', 'teacher media list'],
    backend: ['media table', 'storage policies', 'privacy rules', 'approval workflow'],
    shared: ['media status enum', 'activity labels'],
    data: ['media', 'children', 'classes'],
    edge: ['none required now'],
  },
  {
    id: 'daily-reports',
    name: 'Daily Reports',
    roles: 'teacher, parent, admin',
    priority: 'workflow',
    frontend: ['daily report form', 'feeding/nap/mood/toilet sections', 'parent report detail'],
    backend: ['daily reports table', 'report reactions', 'media/report joins'],
    shared: ['daily report schema', 'care event enums'],
    data: ['daily_reports', 'report_reactions', 'children'],
    edge: ['none required now'],
  },
  {
    id: 'milestones-reports',
    name: 'Milestones and Quarterly Reports',
    roles: 'teacher, parent, admin',
    priority: 'learning',
    frontend: ['milestone list', 'milestone record page', 'share cards', 'quarterly reports'],
    backend: ['milestones', 'quarterly reports', 'sharing rules'],
    shared: ['milestone types', 'quarterly report DTOs'],
    data: ['milestones', 'quarterly_reports', 'children'],
    edge: ['none required now'],
  },
  {
    id: 'health-safety',
    name: 'Health and Safety',
    roles: 'admin, parent, teacher',
    priority: 'safety',
    frontend: ['health profile', 'allergy/condition/medication dialogs', 'health alerts'],
    backend: ['health records', 'documents', 'parent update requests', 'alert computation'],
    shared: ['health schema', 'severity/status enums'],
    data: ['child_health_records', 'child_health_documents', 'children'],
    edge: ['none required now'],
  },
  {
    id: 'chat-messages',
    name: 'Chat and Messages',
    roles: 'all roles',
    priority: 'communication',
    frontend: ['chat panel', 'chat widget', 'recipient picker', 'role inbox pages'],
    backend: ['chat members', 'messages', 'realtime publication', 'moderation fields'],
    shared: ['message DTOs', 'participant types'],
    data: ['chat_conversations', 'chat_messages', 'chat_members'],
    edge: ['none required now'],
  },
  {
    id: 'broadcast-notifications',
    name: 'Broadcasts and Notifications',
    roles: 'admin, teacher, parent',
    priority: 'communication',
    frontend: ['broadcast composer', 'broadcast history', 'notification drawer', 'push setup'],
    backend: ['notifications table', 'dispatch functions', 'push subscriptions', 'urgent broadcast'],
    shared: ['notification channel enum', 'broadcast schema'],
    data: ['notifications', 'broadcast_messages', 'user_push_subscriptions'],
    edge: ['email-dispatch', 'sms-dispatch', 'whatsapp-dispatch', 'emergency-broadcast'],
  },
  {
    id: 'surveys-forms',
    name: 'Surveys and Dynamic Forms',
    roles: 'admin, parent',
    priority: 'engagement',
    frontend: ['survey builder', 'form renderer', 'survey analytics', 'parent survey page'],
    backend: ['survey tables', 'response storage', 'targeting notifications'],
    shared: ['survey schema', 'question type enum'],
    data: ['surveys', 'survey_responses', 'notifications'],
    edge: ['none required now'],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    roles: 'admin, manager',
    priority: 'ops',
    frontend: ['inventory page', 'stock list', 'inventory filters'],
    backend: ['inventory tables', 'stock movement rules'],
    shared: ['inventory item types', 'stock status enum'],
    data: ['inventory_items', 'inventory_movements'],
    edge: ['none required now'],
  },
  {
    id: 'meals-nutrition',
    name: 'Meals and Nutrition',
    roles: 'admin, teacher, parent',
    priority: 'care',
    frontend: ['meal plans page', 'parent meals page', 'teacher feeding section'],
    backend: ['meal plan tables', 'dietary preferences', 'feeding entries'],
    shared: ['meal schema', 'dietary preference types'],
    data: ['meal_plans', 'child_dietary_preferences', 'daily_reports'],
    edge: ['none required now'],
  },
  {
    id: 'loyalty-rewards-packages',
    name: 'Loyalty, Rewards, Packages',
    roles: 'admin, parent, finance',
    priority: 'engagement',
    frontend: ['loyalty dashboard', 'parent rewards', 'points redemption', 'packages page'],
    backend: ['loyalty points', 'redemptions', 'packages/pricing tables'],
    shared: ['loyalty transaction types', 'package DTOs'],
    data: ['loyalty_points', 'loyalty_redemptions', 'packages'],
    edge: ['none required now'],
  },
  {
    id: 'qr-pickup-checkin',
    name: 'QR, Pickup, and Check-in',
    roles: 'admin, teacher, parent',
    priority: 'safety',
    frontend: ['QR code cards', 'scanner page', 'pickup identity dialog', 'QR history'],
    backend: ['QR token issuance', 'QR verification', 'pickup snapshot', 'delegate pickup tokens'],
    shared: ['QR token types', 'scan parser', 'expiry labels'],
    data: ['qr_tokens', 'pickup_verifications', 'attendance_records'],
    edge: ['qr-token', 'qr-verify', 'event-qr-issue'],
  },
  {
    id: 'community-content',
    name: 'Community and Content Library',
    roles: 'admin, teacher, parent',
    priority: 'content',
    frontend: ['community pages', 'content library pages', 'content cards'],
    backend: ['community content tables', 'visibility policies'],
    shared: ['content type enum', 'audience types'],
    data: ['community_posts', 'content_library_items'],
    edge: ['none required now'],
  },
  {
    id: 'personal-reminders',
    name: 'Personal and Teacher Reminders',
    roles: 'admin, teacher, parent',
    priority: 'communication',
    frontend: ['reminders page', 'teacher reminders page', 'alert host'],
    backend: ['personal reminders', 'repeat flags', 'notification scheduling'],
    shared: ['reminder recurrence types', 'reminder schema'],
    data: ['personal_reminders', 'notifications'],
    edge: ['none required now'],
  },
  {
    id: 'ai-help',
    name: 'AI Assistant and Help Center',
    roles: 'all roles',
    priority: 'support',
    frontend: ['AI assistant panel', 'help panel', 'help preferences', 'route tracker'],
    backend: ['AI assistant edge function', 'AI safety/rate limit context', 'AI import mapper'],
    shared: ['AI tool types', 'help article metadata'],
    data: ['help_ai_preferences', 'ai_sessions'],
    edge: ['ai-assistant', 'ai-import-mapper'],
  },
  {
    id: 'pwa-i18n-theme',
    name: 'PWA, I18n, Theme',
    roles: 'all roles',
    priority: 'platform',
    frontend: ['service worker bridge', 'install prompt', 'offline indicator', 'locales', 'theme switcher'],
    backend: ['none by default', 'push subscription storage for notification support'],
    shared: ['locale enum', 'theme preference type'],
    data: ['user_push_subscriptions', 'theme_preferences'],
    edge: ['none required now'],
  },
  {
    id: 'ops-backup-export',
    name: 'Ops, Backup, Export',
    roles: 'ops, admin',
    priority: 'ops',
    frontend: ['tenant export card', 'usage views if needed'],
    backend: ['tenant export edge function', 'integrity scripts', 'restore rehearsal', 'usage watch'],
    shared: ['export job status enum', 'ops result DTOs'],
    data: ['tenant_export_jobs', 'audit_logs'],
    edge: ['tenant-export'],
  },
];

const edgeFunctionStructures = [
  {
    name: 'ai-assistant',
    module: 'ai-help',
    purpose: 'Handles AI assistant requests, context, safety checks, and tool actions.',
    frontend: ['AI assistant panel', 'Help panel', 'route tracker', 'preferences page'],
    shared: ['AI message DTOs', 'tool action types', 'safety result types'],
    backend: ['index.ts', 'rate limit guard', 'context builder', 'tool dispatcher'],
    tests: ['request validation', 'rate limit behavior', 'safe action approval flow'],
  },
  {
    name: 'ai-import-mapper',
    module: 'bulk-import',
    purpose: 'Maps spreadsheet columns into project import fields with AI assistance.',
    frontend: ['Import wizard', 'column mapper', 'review page'],
    shared: ['import field schema', 'mapping confidence type', 'row validation result'],
    backend: ['index.ts', 'AI mapping prompt', 'field normalization', 'mapping response parser'],
    tests: ['bad spreadsheet columns', 'unknown field mapping', 'fallback when AI fails'],
  },
  {
    name: 'child-enrollment-complete',
    module: 'child-enrollment',
    purpose: 'Finalizes child enrollment after form submission and uploaded documents.',
    frontend: ['Child enrollment wizard', 'document upload step', 'submit flow'],
    shared: ['child enrollment schema', 'document requirement types', 'completion payload'],
    backend: ['index.ts', 'payload validator', 'child/application writer', 'document linker'],
    tests: ['required documents', 'duplicate child guard', 'parent/admin access rules'],
  },
  {
    name: 'email-dispatch',
    module: 'broadcast-notifications',
    purpose: 'Sends email notifications for broadcasts, reminders, and operational messages.',
    frontend: ['Broadcast composer', 'notification settings', 'history views'],
    shared: ['message channel enum', 'dispatch payload', 'delivery status type'],
    backend: ['index.ts', 'provider adapter', 'template renderer', 'delivery logger'],
    tests: ['missing recipient', 'provider failure', 'delivery audit write'],
  },
  {
    name: 'emergency-broadcast',
    module: 'broadcast-notifications',
    purpose: 'Creates urgent cross-channel broadcast messages for targeted users.',
    frontend: ['Broadcast composer', 'urgent broadcast controls', 'history detail modal'],
    shared: ['urgent broadcast schema', 'target audience type', 'channel list'],
    backend: ['index.ts', 'target resolver', 'notification writer', 'dispatch trigger'],
    tests: ['target class', 'target all parents', 'permission denial'],
  },
  {
    name: 'event-qr-issue',
    module: 'events-permissions',
    purpose: 'Issues QR tokens for event attendance or event check-in workflows.',
    frontend: ['Event details page', 'event QR card', 'admin attendance section'],
    shared: ['event QR token type', 'expiry policy', 'issue request schema'],
    backend: ['index.ts', 'event permission check', 'token generator', 'token storage'],
    tests: ['expired event', 'wrong nursery', 'duplicate token handling'],
  },
  {
    name: 'parent-signup-complete',
    module: 'parent-signup',
    purpose: 'Completes public parent signup and creates/links parent records.',
    frontend: ['Parent signup page', 'signup review step', 'success page'],
    shared: ['parent signup schema', 'contact validation', 'signup completion payload'],
    backend: ['index.ts', 'account linker', 'parent profile writer', 'application bootstrap'],
    tests: ['duplicate email/mobile', 'invalid nursery', 'missing child data'],
  },
  {
    name: 'payment-reminders',
    module: 'invoices-payments',
    purpose: 'Finds due invoices and creates reminder notifications or dispatch jobs.',
    frontend: ['Invoices page', 'payment record page', 'notification center'],
    shared: ['invoice status enum', 'reminder schedule type', 'payment reminder payload'],
    backend: ['index.ts', 'due invoice query', 'notification creator', 'dispatch queue trigger'],
    tests: ['already paid invoice', 'overdue invoice', 'duplicate reminder prevention'],
  },
  {
    name: 'permission-deadline-reminder',
    module: 'events-permissions',
    purpose: 'Reminds parents before event permission response deadlines.',
    frontend: ['Parent permissions page', 'event details page', 'notification drawer'],
    shared: ['permission deadline type', 'event permission status', 'reminder payload'],
    backend: ['index.ts', 'deadline scanner', 'pending response resolver', 'notification writer'],
    tests: ['deadline passed', 'already answered', 'multi-child event'],
  },
  {
    name: 'process-import',
    module: 'bulk-import',
    purpose: 'Processes import jobs after review, creating children, parents, and related rows.',
    frontend: ['Import progress page', 'import review page', 'admin import wizard'],
    shared: ['import job status enum', 'validated row type', 'import error type'],
    backend: ['index.ts', 'job loader', 'row processor', 'transaction writer', 'status updater'],
    tests: ['partial failure', 'duplicate rows', 'rollback or error status'],
  },
  {
    name: 'qr-token',
    module: 'qr-pickup-checkin',
    purpose: 'Issues child or delegate pickup QR tokens.',
    frontend: ['Parent QR page', 'child QR card', 'delegate pickup QR card'],
    shared: ['QR token payload', 'expiry label type', 'delegate pickup schema'],
    backend: ['index.ts', 'identity check', 'token generator', 'storage writer'],
    tests: ['unauthorized parent', 'expired token policy', 'delegate metadata'],
  },
  {
    name: 'qr-verify',
    module: 'qr-pickup-checkin',
    purpose: 'Verifies scanned QR tokens and records pickup or attendance actions.',
    frontend: ['Teacher scanner page', 'pickup confirm dialog', 'attendance UI'],
    shared: ['scan result type', 'QR verify request', 'pickup snapshot type'],
    backend: ['index.ts', 'token verifier', 'attendance writer', 'pickup snapshot writer'],
    tests: ['expired token', 'wrong nursery', 'already used token'],
  },
  {
    name: 'sms-dispatch',
    module: 'broadcast-notifications',
    purpose: 'Sends SMS notifications through the configured provider.',
    frontend: ['Broadcast composer', 'notification preferences', 'delivery history'],
    shared: ['SMS dispatch payload', 'phone validation type', 'delivery status'],
    backend: ['index.ts', 'phone normalizer', 'provider adapter', 'delivery logger'],
    tests: ['invalid phone', 'provider error', 'audit logging'],
  },
  {
    name: 'staff-onboarding-complete',
    module: 'staff-onboarding',
    purpose: 'Completes staff onboarding and maps form payloads into staff profile records.',
    frontend: ['Staff onboarding wizard', 'document uploads', 'admin staff page'],
    shared: ['staff onboarding schema', 'staff position type', 'completion payload'],
    backend: ['index.ts', 'mapStaffProfile.ts', 'profile writer', 'document linker'],
    tests: ['existing user mode', 'new user mode', 'missing identity fields'],
  },
  {
    name: 'tenant-export',
    module: 'ops-backup-export',
    purpose: 'Exports tenant-scoped data for backup, recovery, or operational review.',
    frontend: ['Tenant export card', 'settings/export UI', 'ops dashboard if added'],
    shared: ['export job status', 'export manifest type', 'tenant scope type'],
    backend: ['index.ts', 'tenant scope resolver', 'table exporter', 'archive writer'],
    tests: ['cross-tenant denial', 'large tenant export', 'export manifest validation'],
  },
  {
    name: 'whatsapp-dispatch',
    module: 'broadcast-notifications',
    purpose: 'Sends WhatsApp notifications for broadcasts and reminders.',
    frontend: ['Broadcast composer', 'channel checkboxes', 'delivery history'],
    shared: ['WhatsApp dispatch payload', 'channel enum', 'delivery result type'],
    backend: ['index.ts', 'provider adapter', 'template renderer', 'delivery logger'],
    tests: ['missing template', 'provider failure', 'delivery audit write'],
  },
];

const files = walk(root);
const relFiles = files.map((file) => toPosix(path.relative(root, file)));
const sourceFiles = files.filter((file) => textExts.has(path.extname(file).toLowerCase()));
const packageJson = JSON.parse(safeRead('package.json'));
const routerText = safeRead('src/router/AppRouter.tsx');
const routeCount = [...routerText.matchAll(/<Route\s+(?:index|path=)/g)].length;
const edgeFunctionCount = relFiles.filter((rel) => rel.startsWith('supabase/functions/') && rel.endsWith('index.ts')).length;
const migrationCount = relFiles.filter((rel) => rel.startsWith('supabase/migrations/') && rel.endsWith('.sql')).length;
const totalLines = sourceFiles.reduce((sum, file) => sum + countLines(file), 0);

const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 42;
const contentWidth = pageWidth - margin * 2;

const colors = {
  ink: [24, 32, 45],
  muted: [88, 104, 127],
  border: [216, 226, 238],
  panel: [248, 250, 253],
  frontend: [37, 99, 235],
  backend: [22, 163, 74],
  shared: [124, 58, 237],
  db: [217, 119, 6],
  ops: [15, 118, 110],
  risk: [220, 38, 38],
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
  doc.setDrawColor(...colors.frontend);
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

function drawTree(x, y, lines, lineHeight = 10.5, size = 7.5) {
  setText(colors.slate, size, 'normal', 'courier');
  lines.forEach((line, index) => {
    doc.text(line, x, y + index * lineHeight);
  });
  doc.setFont('helvetica', 'normal');
}

function flowBox(x, y, w, h, title, text, color) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, 6, 4, 4, 'F');
  setText(colors.ink, 10.5, 'bold');
  doc.text(title, x + 9, y + 22);
  setText(colors.muted, 7.5);
  doc.text(doc.splitTextToSize(text, w - 18), x + 9, y + 38);
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

function drawMonolithDiagram(x, y, w) {
  doc.setDrawColor(...colors.slate);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, y, w, 292, 10, 10, 'FD');
  setText(colors.ink, 13, 'bold');
  doc.text('One deployable system, many isolated modules', x + 16, y + 24);
  setText(colors.muted, 8);
  doc.text('Each module owns frontend + backend + shared contracts. Modules communicate through public APIs, not deep imports.', x + 16, y + 40);

  const moduleW = (w - 48) / 3;
  const moduleH = 180;
  ['events-permissions', 'invoices-payments', 'attendance'].forEach((name, index) => {
    const mx = x + 16 + index * (moduleW + 8);
    const my = y + 64;
    doc.setDrawColor(...colors.border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(mx, my, moduleW, moduleH, 8, 8, 'FD');
    setText(colors.ink, 9.5, 'bold');
    doc.text(name, mx + 8, my + 18);
    const sliceH = 34;
    [
      ['frontend', colors.frontend],
      ['backend', colors.backend],
      ['shared', colors.shared],
      ['data/edge', colors.db],
    ].forEach(([label, color], idx) => {
      const sy = my + 36 + idx * (sliceH + 5);
      doc.setFillColor(...color);
      doc.roundedRect(mx + 8, sy, moduleW - 16, sliceH, 5, 5, 'F');
      setText([255, 255, 255], 8, 'bold');
      doc.text(label, mx + 16, sy + 21);
    });
  });

  flowBox(x + 16, y + 258, w - 32, 22, 'Shared kernel', 'Only generic UI, generated database types, permission contracts, validators, and pure utilities.', colors.slate);
}

function drawRequestFlow(x, y, w) {
  const gap = 10;
  const boxW = (w - gap * 5) / 6;
  const boxes = [
    ['Route', 'module page', colors.frontend],
    ['UI', 'component', colors.frontend],
    ['Hook', 'React Query', colors.frontend],
    ['API', 'typed call', colors.shared],
    ['Backend', 'Edge/RPC/API', colors.backend],
    ['Data', 'Postgres/RLS', colors.db],
  ];
  boxes.forEach((box, index) => {
    const bx = x + index * (boxW + gap);
    flowBox(bx, y, boxW, 70, box[0], box[1], box[2]);
    if (index < boxes.length - 1) arrow(bx + boxW, y + 35, bx + boxW + gap - 2, y + 35);
  });
}

function drawBarChart(x, y, w, h, rows) {
  const data = rows.slice(0, 10);
  const max = Math.max(...data.map((item) => item.value), 1);
  const labelW = 148;
  const rowH = h / data.length;
  data.forEach((item, index) => {
    const yy = y + index * rowH + 3;
    setText(colors.slate, 7.2);
    doc.text(item.label, x, yy + 8);
    doc.setFillColor(234, 240, 248);
    doc.roundedRect(x + labelW, yy, w - labelW - 38, 9, 4, 4, 'F');
    doc.setFillColor(...[colors.frontend, colors.backend, colors.shared, colors.db, colors.ops][index % 5]);
    doc.roundedRect(x + labelW, yy, Math.max(2, ((w - labelW - 38) * item.value) / max), 9, 4, 4, 'F');
    setText(colors.muted, 7.2, 'bold');
    doc.text(String(item.value), x + w - 26, yy + 8);
  });
}

function drawModuleCard(module, x, y, w, h) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  const palette =
    module.priority === 'foundation'
      ? colors.shared
      : module.priority === 'financial'
        ? colors.db
        : module.priority === 'safety'
          ? colors.risk
          : module.priority === 'ops'
            ? colors.ops
            : colors.frontend;
  doc.setFillColor(...palette);
  doc.rect(x, y, w, 6, 'F');

  setText(colors.ink, 11.4, 'bold');
  doc.text(module.name, x + 10, y + 22);
  setText(colors.muted, 7.1, 'bold');
  doc.text(`Module: ${module.id} | Roles: ${module.roles} | Priority: ${module.priority}`, x + 10, y + 36);

  const colGap = 8;
  const colW = (w - 20 - colGap * 2) / 3;
  [
    ['Frontend', module.frontend, colors.frontend],
    ['Backend', module.backend, colors.backend],
    ['Shared', module.shared, colors.shared],
  ].forEach(([label, lines, color], index) => {
    const cx = x + 10 + index * (colW + colGap);
    setText(color, 7.8, 'bold');
    doc.text(label, cx, y + 56);
    setText(colors.muted, 6.2);
    doc.text(doc.splitTextToSize(lines.join('\n'), colW - 4), cx, y + 68);
  });

  setText(colors.db, 7.8, 'bold');
  doc.text('Data ownership', x + 10, y + h - 45);
  setText(colors.muted, 6.2);
  doc.text(doc.splitTextToSize(module.data.join(', '), w / 2 - 18), x + 10, y + h - 33);

  setText(colors.backend, 7.8, 'bold');
  doc.text('Edge/API ownership', x + w / 2 + 4, y + h - 45);
  setText(colors.muted, 6.2);
  doc.text(doc.splitTextToSize(module.edge.join(', '), w / 2 - 16), x + w / 2 + 4, y + h - 33);
}

function drawRecommendationGraphic(x, y, w) {
  const gap = 12;
  const boxW = (w - gap * 2) / 3;
  flowBox(
    x,
    y,
    boxW,
    92,
    'Recommended now',
    'Vertical Slice Modular Monolith. One deployable project with strict modules.',
    colors.frontend,
  );
  flowBox(
    x + boxW + gap,
    y,
    boxW,
    92,
    'Backend style',
    'Supabase-first backend. Edge Functions and RPCs stay inside module ownership.',
    colors.backend,
  );
  flowBox(
    x + (boxW + gap) * 2,
    y,
    boxW,
    92,
    'Optional later',
    'Add apps/api only for webhooks, long jobs, server secrets, or complex orchestration.',
    colors.db,
  );
  arrow(x + boxW, y + 46, x + boxW + gap - 2, y + 46);
  arrow(x + boxW * 2 + gap, y + 46, x + (boxW + gap) * 2 - 2, y + 46);

  const panelY = y + 122;
  doc.setDrawColor(...colors.border);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, panelY, w, 116, 8, 8, 'FD');
  setText(colors.ink, 11.5, 'bold');
  doc.text('Decision rule', x + 12, panelY + 24);
  drawTree(x + 12, panelY + 44, [
    'Use modules for product features.',
    'Use shared-kernel only for generic contracts, permissions, generated DB types, and utilities.',
    'Use backend/supabase/modules/<module> for database, policies, and Edge Functions.',
    'Use apps/api only when Supabase Edge Functions are no longer enough.',
  ], 12, 7.6);
}

function drawFunctionCard(fn, x, y, w, h) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...colors.backend);
  doc.rect(x, y, w, 6, 'F');

  setText(colors.ink, 11.2, 'bold');
  doc.text(fn.name, x + 10, y + 22);
  setText(colors.muted, 7.1, 'bold');
  doc.text(`Owner module: ${fn.module}`, x + 10, y + 36);
  setText(colors.muted, 7);
  doc.text(doc.splitTextToSize(fn.purpose, w - 20), x + 10, y + 51);

  const colGap = 8;
  const colW = (w - 20 - colGap * 2) / 3;
  [
    ['Frontend calls', fn.frontend, colors.frontend],
    ['Shared contract', fn.shared, colors.shared],
    ['Backend files', fn.backend, colors.backend],
  ].forEach(([label, lines, color], index) => {
    const cx = x + 10 + index * (colW + colGap);
    setText(color, 7.5, 'bold');
    doc.text(label, cx, y + 92);
    setText(colors.muted, 5.9);
    doc.text(doc.splitTextToSize(lines.join('\n'), colW - 5), cx, y + 104);
  });

  setText(colors.db, 7.5, 'bold');
  doc.text('Recommended target folder', x + 10, y + h - 57);
  drawTree(x + 10, y + h - 43, [
    `backend/supabase/modules/${fn.module}/functions/${fn.name}/`,
    '  index.ts',
    '  README.md',
    '  __tests__/',
  ], 8.5, 6.1);

  setText(colors.ops, 7.5, 'bold');
  doc.text('Tests to add', x + w / 2 + 4, y + h - 57);
  setText(colors.muted, 5.9);
  doc.text(doc.splitTextToSize(fn.tests.join('\n'), w / 2 - 18), x + w / 2 + 4, y + h - 43);
}

function addFooters() {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...colors.border);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    setText(colors.muted, 7);
    doc.text(`XO Platform vertical-slice modular monolith - generated ${generatedAt}`, margin, pageHeight - 20);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin - 48, pageHeight - 20);
  }
}

// Cover
doc.setFillColor(248, 250, 252);
doc.rect(0, 0, pageWidth, pageHeight, 'F');
doc.setFillColor(...colors.slate);
doc.rect(0, 0, pageWidth, 172, 'F');
setText([255, 255, 255], 28, 'bold');
doc.text('XO Platform', margin, 68);
setText([226, 232, 240], 16, 'bold');
doc.text('Vertical Slice Modular Monolith', margin, 98);
setText([226, 232, 240], 10);
doc.text('Every module owns frontend, backend, shared contracts, and data boundaries', margin, 122);

card(margin, 206, 118, 86, 'Modules', modules.length, 'Feature modules in this plan.', colors.frontend);
card(margin + 132, 206, 118, 86, 'Routes', routeCount, 'Current route declarations.', colors.shared);
card(margin + 264, 206, 118, 86, 'Edge funcs', edgeFunctionCount, 'Current backend functions.', colors.backend);
card(margin + 396, 206, 118, 86, 'Migrations', migrationCount, 'Current SQL migrations.', colors.db);

let y = 336;
setText(colors.ink, 15, 'bold');
doc.text('Meaning', margin, y);
y += 22;
setText(colors.muted, 10);
doc.text(
  doc.splitTextToSize(
    'A modular monolith is one deployable project, but its code is divided into strict modules. A vertical slice module contains the frontend screens, frontend hooks, backend handlers/functions, shared validation/types, and owned database objects for one feature.',
    contentWidth,
  ),
  margin,
  y,
);
y += 72;
drawMonolithDiagram(margin, y, contentWidth);

// Recommendation
addPage();
y = sectionTitle('Recommended Structure Choice', 58, 'For this project, the best balance is a Vertical Slice Modular Monolith with Supabase-first backend ownership.');
drawRecommendationGraphic(margin, y, contentWidth);
y += 270;
y = table(
  ['Question', 'Recommendation', 'Why it fits XO Platform'],
  [
    ['Should frontend and backend be split?', 'Yes, by module ownership, not by microservices.', 'The app has many business areas, but it still benefits from one repo and one coordinated deployment.'],
    ['Should every module have frontend/backend/shared?', 'Yes.', 'When events, invoices, attendance, or staff changes, the full slice is easy to find and review.'],
    ['Should every module use controller/service/repository?', 'Not now by default.', 'Supabase direct calls and Edge Functions are enough for most modules. Add controller/service/repository only inside apps/api later.'],
    ['Where do Supabase functions live?', 'backend/supabase/modules/<module>/functions/<function>.', 'Each backend function gets an owner module and stops floating in a global folder.'],
    ['Where do schemas and types live?', 'Inside the module shared folder, or shared-kernel if truly cross-cutting.', 'Validation contracts stay close to the feature that owns them.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 145 }, 1: { cellWidth: 165 }, 2: { cellWidth: 200 } }, fontSize: 7.4 },
);

// Target root structure
addPage();
y = sectionTitle('Target Root Structure', 58, 'This keeps the project deployable as one system while every feature remains separated by ownership.');
const rootTreeY = y;
const columnGap = 14;
const columnWidth = (contentWidth - columnGap) / 2;
const panelHeight = 332;
const leftRootStructure = [
  'XO-platform/',
  '  apps/',
  '    web/',
  '      public/',
  '      index.html',
  '      vite.config.ts',
  '      package.json',
  '      src/',
  '        app/',
  '          router/',
  '          providers/',
  '          layouts/',
  '        modules/',
  '          <module>/',
  '            frontend/',
  '              pages/',
  '              components/',
  '              hooks/',
  '              api-client/',
  '            shared/',
  '              schemas/',
  '              types.ts',
  '              constants.ts',
  '            index.ts',
  '        shared/',
  '          ui/',
  '          components/',
  '          hooks/',
  '          lib/',
  '        main.tsx',
  '        index.css',
];
const rightRootStructure = [
  '  apps/',
  '    api/                # optional',
  '      src/modules/<module>/',
  '        backend/',
  '          routes.ts',
  '          controller.ts',
  '          service.ts',
  '          repository.ts',
  '          jobs.ts',
  '',
  '  backend/',
  '    supabase/',
  '      modules/',
  '        <module>/',
  '          migrations/',
  '          functions/',
  '          policies/',
  '          seed.sql',
  '      functions/_shared/',
  '      config.toml',
  '',
  '  packages/',
  '    shared-kernel/',
  '      src/',
  '        permissions/',
  '        generated-db/',
  '        common-types/',
  '        utils/',
  '  scripts/',
  '  docs/',
  '  tests/',
];

doc.setDrawColor(...colors.border);
doc.setFillColor(255, 255, 255);
doc.roundedRect(margin, rootTreeY, columnWidth, panelHeight, 8, 8, 'FD');
doc.roundedRect(margin + columnWidth + columnGap, rootTreeY, columnWidth, panelHeight, 8, 8, 'FD');
doc.setFillColor(...colors.frontend);
doc.roundedRect(margin, rootTreeY, columnWidth, 6, 4, 4, 'F');
doc.setFillColor(...colors.backend);
doc.roundedRect(margin + columnWidth + columnGap, rootTreeY, columnWidth, 6, 4, 4, 'F');
setText(colors.frontend, 9, 'bold');
doc.text('Frontend App', margin + 10, rootTreeY + 22);
setText(colors.backend, 9, 'bold');
doc.text('Backend, Shared Kernel, Ops', margin + columnWidth + columnGap + 10, rootTreeY + 22);
drawTree(margin + 10, rootTreeY + 40, leftRootStructure, 8.7, 6.35);
drawTree(margin + columnWidth + columnGap + 10, rootTreeY + 40, rightRootStructure, 8.7, 6.35);

y = rootTreeY + panelHeight + 28;
setText(colors.ink, 12, 'bold');
doc.text('One module owns the whole vertical slice', margin, y);
y += 14;
doc.setDrawColor(...colors.border);
doc.setFillColor(248, 250, 252);
doc.roundedRect(margin, y, contentWidth, 60, 8, 8, 'FD');
drawTree(margin + 12, y + 18, [
  'module = frontend + backend + shared contract + data ownership',
  'example: events-permissions owns event pages, event hooks, event API calls,',
  'event validation, event edge functions, event migrations, and event RLS tests.',
], 10, 7.1);

// Module anatomy
addPage();
y = sectionTitle('Module Anatomy', 58, 'A feature module can be understood without jumping across the entire project.');
drawTree(margin, y, [
  'modules/events-permissions/',
  '  frontend/',
  '    pages/',
  '      AdminEventsListPage.tsx',
  '      AdminEventDetailsPage.tsx',
  '      ParentEventsPage.tsx',
  '      TeacherEventsPage.tsx',
  '    components/',
  '      EventCard.tsx',
  '      EventFormFields.tsx',
  '      ParentPermissionCard.tsx',
  '    hooks/',
  '      useAdminEventsList.ts',
  '      useParentEventPermissions.ts',
  '      useTeacherEventsList.ts',
  '    api-client/',
  '      eventsClient.ts',
  '      permissionsClient.ts',
  '  backend/',
  '    edge-functions/',
  '      event-qr-issue/',
  '      permission-deadline-reminder/',
  '    db/',
  '      migrations/',
  '      policies/',
  '      seed.sql',
  '    services/',
  '      eventPermissionService.ts',
  '  shared/',
  '    schemas/',
  '      event.schema.ts',
  '      permission.schema.ts',
  '    types.ts',
  '    constants.ts',
  '  __tests__/',
  '    events.route-smoke.test.tsx',
  '    events.rls.sql',
  '  index.ts',
], 10.3, 7.1);
y = 448;
y = table(
  ['Part', 'What belongs here', 'What does not belong here'],
  [
    ['frontend/pages', 'Route-level screens and role variants.', 'Raw SQL/Supabase chains and complex business rules.'],
    ['frontend/components', 'UI pieces used by this module.', 'Generic button/card/input primitives.'],
    ['frontend/hooks', 'React Query hooks, form state, cache invalidation.', 'Backend secrets or direct service-role calls.'],
    ['frontend/api-client', 'Typed client calls to Supabase, Edge Functions, or API modules.', 'UI rendering logic.'],
    ['backend', 'Edge functions, API routes, domain services, database ownership.', 'React code.'],
    ['shared', 'Zod schemas, DTOs, enums, constants used by frontend and backend.', 'Feature UI or server runtime code.'],
    ['tests', 'Route smoke, service tests, RLS regression tests.', 'Manual checklist only.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 205 }, 2: { cellWidth: 200 } }, fontSize: 7.2 },
);

// Flow page
addPage();
y = sectionTitle('How a Request Moves', 58, 'This is the clean path inside one vertical slice. The page never reaches directly into unrelated modules.');
drawRequestFlow(margin, y, contentWidth);
y += 112;
y = table(
  ['Step', 'Example in events-permissions', 'Rule'],
  [
    ['Route', '/admin/events/:eventId', 'Route imports the module page from its public index.'],
    ['Page', 'AdminEventDetailsPage', 'Composes UI and reads params only.'],
    ['Hook', 'useAdminEventDetails', 'Owns loading/error/cache behavior.'],
    ['Client', 'eventsClient.getEventDetails', 'Typed Supabase/RPC/Edge call boundary.'],
    ['Backend', 'event permission service / edge function', 'Validates permissions and orchestration.'],
    ['Database', 'events, event_permissions, event_attendees', 'RLS and migrations belong to backend ownership.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 220 }, 2: { cellWidth: 220 } }, fontSize: 7.5 },
);
y = doc.lastAutoTable.finalY + 18;
setText(colors.ink, 12, 'bold');
doc.text('Allowed dependency direction', margin, y);
y += 14;
drawTree(margin, y, [
  'app shell -> modules -> shared-kernel',
  'module frontend -> same module shared -> same module backend client',
  'module backend -> same module shared -> shared-kernel/generated DB types',
  'module A -> module B only through public index.ts or an explicit integration contract',
], 11.5, 7.5);

// Current repo mapping
addPage();
y = sectionTitle('Current Repo to Modular Monolith', 58, 'The current project can move here gradually. The chart shows where code exists today.');
drawBarChart(margin, y, contentWidth, 165, groupCount(relFiles, layerOf));
y += 200;
y = table(
  ['Current folder', 'Target modular-monolith home', 'Action'],
  [
    ['src/pages/admin/AdminEvents*.tsx', 'apps/web/src/modules/events-permissions/frontend/pages', 'Move role pages into event module.'],
    ['src/hooks/useAdminEventsList.ts', 'apps/web/src/modules/events-permissions/frontend/hooks', 'Move feature hook beside pages.'],
    ['src/lib/event*.ts', 'apps/web/src/modules/events-permissions/frontend/api-client or shared', 'Split API client, schema, and pure helpers.'],
    ['supabase/functions/event-qr-issue', 'backend/supabase/modules/events-permissions/functions/event-qr-issue', 'Move backend owner under module.'],
    ['supabase/migrations/*event*.sql', 'backend/supabase/modules/events-permissions/migrations', 'Group migrations by owning module for readability.'],
    ['src/lib/permissions/*', 'packages/shared-kernel/src/permissions', 'Permission engine is shared kernel.'],
    ['src/components/ui/*', 'apps/web/src/shared/ui', 'Keep UI primitives outside modules.'],
    ['src/components/layouts/*', 'apps/web/src/app/layouts', 'Layouts are app shell.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 165 }, 1: { cellWidth: 220 }, 2: { cellWidth: 125 } }, fontSize: 7.2 },
);

// Backend options
addPage();
y = sectionTitle('Backend Inside Each Module', 58, 'Each module can use Supabase only, or Supabase plus a Node API module when the workflow needs it.');
y = table(
  ['Backend option', 'Use for', 'Project example'],
  [
    ['Supabase direct client', 'Simple CRUD protected by RLS.', 'children profiles, inventory, meals, classes.'],
    ['Supabase RPC', 'A database transaction or permission-sensitive query.', 'attendance summaries, finance rollups, set class lead.'],
    ['Supabase Edge Function', 'Server-side workflow close to Supabase.', 'QR verification, import processing, AI assistant, dispatch, tenant export.'],
    ['apps/api module', 'Long jobs, webhooks, external secrets, complex orchestration, or BFF endpoints.', 'future payment webhooks, external CRM sync, advanced reporting.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 135 }, 1: { cellWidth: 195 }, 2: { cellWidth: 180 } }, fontSize: 7.6 },
);
y = doc.lastAutoTable.finalY + 18;
setText(colors.ink, 12, 'bold');
doc.text('Backend module shape when apps/api is added', margin, y);
y += 14;
drawTree(margin, y, [
  'apps/api/src/modules/invoices-payments/',
  '  backend/',
  '    routes.ts          # HTTP routes / webhook routes',
  '    controller.ts      # request/response mapping',
  '    service.ts         # business workflow',
  '    repository.ts      # DB calls only',
  '    jobs.ts            # background jobs',
  '    validation.ts      # imports shared schemas',
  '    types.ts',
  '  index.ts',
], 11, 7.6);

// Shared kernel
addPage();
y = sectionTitle('Shared Kernel', 58, 'Shared kernel is intentionally small. It is the code that every module may import without creating messy dependencies.');
drawTree(margin, y, [
  'packages/shared-kernel/src/',
  '  generated-db/',
  '    database.types.ts',
  '    tableNames.ts',
  '  permissions/',
  '    matrix.ts',
  '    can.ts',
  '    types.ts',
  '  common-types/',
  '    role.ts',
  '    locale.ts',
  '    money.ts',
  '    apiResult.ts',
  '  utils/',
  '    dates.ts',
  '    names.ts',
  '    phone.ts',
  '    assertNever.ts',
  '  index.ts',
], 11, 7.6);
y = 302;
y = table(
  ['Allowed in shared kernel', 'Not allowed in shared kernel'],
  [
    ['Generated Supabase database types', 'Feature pages/components.'],
    ['Permission matrix and can() helper', 'Feature-specific Supabase query chains.'],
    ['Common enums and DTO primitives', 'Business workflows for one module.'],
    ['Pure formatting helpers', 'React state that belongs to one UI.'],
    ['Cross-cutting validation utilities', 'Large mixed helpers named utils for many domains.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 255 }, 1: { cellWidth: 255 } }, fontSize: 7.6 },
);
y = doc.lastAutoTable.finalY + 16;
setText(colors.ink, 12, 'bold');
doc.text('Boundary test', margin, y);
y += 14;
setText(colors.muted, 9);
doc.text(
  doc.splitTextToSize(
    'If a file name contains a business noun like invoice, attendance, event, child, staff, media, QR, health, course, survey, or admission, it probably belongs inside that module, not shared kernel.',
    contentWidth,
  ),
  margin,
  y,
);

// Summary table
addPage();
y = sectionTitle('Module Summary', 58, 'Every module owns a frontend area, backend area, shared contract, and data boundary.');
y = table(
  ['Module', 'Roles', 'Frontend owns', 'Backend/data owns'],
  modules.map((module) => [
    module.name,
    module.roles,
    module.frontend.slice(0, 2).join('; '),
    [...module.backend.slice(0, 1), `data: ${module.data.slice(0, 3).join(', ')}`].join('; '),
  ]),
  y,
  { columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 95 }, 2: { cellWidth: 150 }, 3: { cellWidth: 135 } }, fontSize: 6.25 },
);

// Module cards, two per page
for (let index = 0; index < modules.length; index += 2) {
  addPage();
  y = sectionTitle('Detailed Module Graphic', 58, `Frontend, backend, shared contract, data, and edge/API ownership for modules ${index + 1}-${Math.min(index + 2, modules.length)}.`);
  drawModuleCard(modules[index], margin, y, contentWidth, 282);
  if (modules[index + 1]) drawModuleCard(modules[index + 1], margin, y + 306, contentWidth, 282);
}

// Edge function structure summary
addPage();
y = sectionTitle('Backend Function Structure Map', 58, 'Every current Supabase Edge Function should have an owning module, shared request/response contract, backend implementation folder, and focused tests.');
y = table(
  ['Function', 'Owner module', 'Recommended target folder'],
  edgeFunctionStructures.map((fn) => [
    fn.name,
    fn.module,
    `backend/supabase/modules/${fn.module}/functions/${fn.name}/`,
  ]),
  y,
  { columnStyles: { 0: { cellWidth: 165 }, 1: { cellWidth: 135 }, 2: { cellWidth: 210 } }, fontSize: 7 },
);
y = doc.lastAutoTable.finalY + 10;
setText(colors.ink, 12, 'bold');
doc.text('Function folder rule', margin, y);
y += 14;
drawTree(margin, y, [
  'backend/supabase/modules/<module>/functions/<function>/',
  '  index.ts          # HTTP handler and orchestration entry',
  '  contracts.ts      # imports shared schema/types when useful',
  '  service.ts        # complex workflow only if function grows',
  '  README.md         # purpose, env vars, input, output, owner',
  '  __tests__/        # request validation, permissions, edge cases',
], 11, 7.5);

for (let index = 0; index < edgeFunctionStructures.length; index += 2) {
  addPage();
  y = sectionTitle('Detailed Backend Function Graphic', 58, `Frontend, shared contract, backend files, and test structure for functions ${index + 1}-${Math.min(index + 2, edgeFunctionStructures.length)}.`);
  drawFunctionCard(edgeFunctionStructures[index], margin, y, contentWidth, 282);
  if (edgeFunctionStructures[index + 1]) {
    drawFunctionCard(edgeFunctionStructures[index + 1], margin, y + 306, contentWidth, 282);
  }
}

// Migration plan
addPage();
y = sectionTitle('Migration Plan', 58, 'Move one module at a time. Keep the app working after every wave.');
y = table(
  ['Wave', 'Move', 'Result'],
  [
    ['1', 'Create app shell, modules folder, backend/supabase/modules, and shared-kernel package.', 'New structure exists without changing behavior.'],
    ['2', 'Move generated DB types and permissions to shared-kernel.', 'Type drift and permission duplication start to shrink.'],
    ['3', 'Move high-risk modules first: events, invoices, attendance, QR, onboarding.', 'Most change-heavy workflows become easier to maintain.'],
    ['4', 'Move admin/parent/teacher pages into their owning modules.', 'Role pages for the same feature are close together.'],
    ['5', 'Move Supabase edge functions and migrations under backend module owners.', 'Backend ownership becomes visible.'],
    ['6', 'Add module-level tests: route smoke, service tests, RLS SQL tests.', 'Clean structure is protected by checks.'],
    ['7', 'Only then consider apps/api modules for workflows Supabase cannot handle cleanly.', 'Avoid premature microservice complexity.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 270 }, 2: { cellWidth: 192 } }, fontSize: 7.5 },
);
y = doc.lastAutoTable.finalY + 16;
setText(colors.ink, 12, 'bold');
doc.text('Definition of done for one migrated module', margin, y);
y += 14;
drawTree(margin, y, [
  '[ ] Pages, components, hooks, API client, schemas, and types are inside the module.',
  '[ ] Backend functions/migrations/policies are owned by the module or documented if shared.',
  '[ ] Public imports go through module index.ts.',
  '[ ] No page contains raw business-heavy Supabase logic.',
  '[ ] npm run typecheck and npm run lint pass for changed files.',
  '[ ] At least one route smoke test or RLS test covers the module risk.',
], 11, 7.4);

// Appendix
addPage();
y = sectionTitle('Appendix', 58, 'Current repository facts used by this report.');
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
    ['Route declarations', String(routeCount)],
    ['Supabase edge function index files', String(edgeFunctionCount)],
    ['Supabase migration files', String(migrationCount)],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 190 }, 1: { cellWidth: 320 } }, fontSize: 7.6 },
);
y = doc.lastAutoTable.finalY + 14;
setText(colors.ink, 12, 'bold');
doc.text('Current layer counts', margin, y);
y += 12;
table(
  ['Layer', 'Files'],
  groupCount(relFiles, layerOf).map((row) => [row.label, String(row.value)]),
  y,
  { columnStyles: { 0: { cellWidth: 250 }, 1: { cellWidth: 80 } }, fontSize: 7.1 },
);

addFooters();

fs.mkdirSync(path.dirname(docsOutputPath), { recursive: true });
const bytes = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(docsOutputPath, bytes);
fs.writeFileSync(rootOutputPath, bytes);

console.log(`Wrote ${path.relative(root, docsOutputPath)}`);
console.log(`Wrote ${path.relative(root, rootOutputPath)}`);
