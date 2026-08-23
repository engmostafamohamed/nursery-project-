import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'docs');
const outputPath = path.join(outputDir, 'xo-platform-feature-audit.pdf');

const generatedAt = new Date();
const generatedAtLabel = generatedAt.toISOString().slice(0, 10);

const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'attached_assets']);
const textExts = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.sql',
  '.toml',
  '.svg',
]);

function toPosix(p) {
  return p.split(path.sep).join('/');
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

function countLines(fullPath) {
  const ext = path.extname(fullPath).toLowerCase();
  if (!textExts.has(ext)) return 0;
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.length === 0) return 0;
  return content.split(/\r?\n/).length;
}

function compactLabel(value) {
  return String(value)
    .replace(/^src\//, '')
    .replace(/^supabase\//, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
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

function getExtStats(files) {
  return groupCount(files, (file) => {
    const ext = path.extname(file).toLowerCase();
    return ext || '[none]';
  });
}

function getSrcAreaStats(files) {
  const srcFiles = files.filter((file) => toPosix(path.relative(root, file)).startsWith('src/'));
  return groupCount(srcFiles, (file) => {
    const rel = toPosix(path.relative(root, file));
    const parts = rel.split('/');
    if (parts[1] === 'pages') return `pages/${parts[2] ?? 'root'}`;
    if (parts[1] === 'components') return `components/${parts[2] ?? 'root'}`;
    if (parts[1] === 'features') return `features/${parts[2] ?? 'root'}`;
    return parts[1] ?? 'src';
  });
}

function getLineStats(files) {
  const buckets = [
    { label: 'src', prefix: 'src/' },
    { label: 'supabase migrations', prefix: 'supabase/migrations/' },
    { label: 'supabase functions', prefix: 'supabase/functions/' },
    { label: 'scripts', prefix: 'scripts/' },
    { label: 'docs', prefix: 'docs/' },
    { label: 'root configs', prefix: '' },
  ];
  const result = buckets.map((bucket) => ({ ...bucket, files: 0, lines: 0 }));
  for (const file of files) {
    const rel = toPosix(path.relative(root, file));
    const bucket =
      result.find((item) => item.prefix && rel.startsWith(item.prefix)) ??
      result[result.length - 1];
    bucket.files += 1;
    bucket.lines += countLines(file);
  }
  return result.map(({ prefix, ...rest }) => rest);
}

function countFilesUnder(files, prefix) {
  return files.filter((file) => toPosix(path.relative(root, file)).startsWith(prefix)).length;
}

function countRouteBlock(routerText, startToken, endToken) {
  const start = routerText.indexOf(startToken);
  if (start < 0) return 0;
  const end = endToken ? routerText.indexOf(endToken, start + startToken.length) : routerText.length;
  const block = routerText.slice(start, end > -1 ? end : undefined);
  const matches = block.match(/<Route\s+(index|path=)/g) ?? [];
  return Math.max(0, matches.length - 1);
}

function getRouteStats() {
  const routerText = safeRead('src/router/AppRouter.tsx');
  const publicStart = routerText.indexOf('<Route element={<RootLayout />}>');
  const adminStart = routerText.indexOf('<Route path="/admin" element={<AdminLayout />}>');
  const parentStart = routerText.indexOf('<Route path="/parent" element={<ParentLayout />}>');
  const teacherStart = routerText.indexOf('<Route path="/teacher" element={<TeacherLayout />}>');
  const staffStart = routerText.indexOf('<Route path="/staff" element={<StaffLayout />}>');
  const xoStart = routerText.indexOf('<Route path="/xo-admin" element={<XoAdminLayout />}>');
  const wildcardStart = routerText.indexOf('<Route path="*"');
  const publicBlock =
    publicStart >= 0 && adminStart >= 0 ? routerText.slice(publicStart, adminStart) : '';

  return [
    {
      label: 'Admin / manager',
      value: countRouteBlock(routerText, '<Route path="/admin" element={<AdminLayout />}>', '<Route element={<ProtectedRoute allowedRoles={[\'parent\']} />}>'),
    },
    {
      label: 'Parent',
      value: countRouteBlock(routerText, '<Route path="/parent" element={<ParentLayout />}>', '<Route element={<ProtectedRoute allowedRoles={[\'teacher\']} />}>'),
    },
    {
      label: 'Teacher',
      value: countRouteBlock(routerText, '<Route path="/teacher" element={<TeacherLayout />}>', '<Route element={<ProtectedRoute allowedRoles={[\'teacher\']} />}>',),
    },
    {
      label: 'Staff',
      value: countRouteBlock(routerText, '<Route path="/staff" element={<StaffLayout />}>', '<Route element={<ProtectedRoute allowedRoles={[\'xo_super_admin\']} />}>'),
    },
    {
      label: 'XO admin',
      value: countRouteBlock(routerText, '<Route path="/xo-admin" element={<XoAdminLayout />}>', '<Route path="*"'),
    },
    {
      label: 'Public / auth / setup',
      value: (publicBlock.match(/<Route\s+(index|path=)/g) ?? []).length + (wildcardStart >= 0 ? 1 : 0),
    },
  ].filter((item) => item.value > 0);
}

function getBackendSchemaStats(files) {
  const migrationFiles = files.filter((file) => toPosix(path.relative(root, file)).startsWith('supabase/migrations/'));
  const migrationsText = migrationFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const tables = new Set();
  const functions = new Set();

  for (const match of migrationsText.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][\w]*)/gi)) {
    tables.add(match[1]);
  }
  for (const match of migrationsText.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][\w]*)/gi)) {
    functions.add(match[1]);
  }

  const functionDirs = new Set(
    files
      .map((file) => toPosix(path.relative(root, file)))
      .filter((rel) => rel.startsWith('supabase/functions/') && rel.endsWith('index.ts'))
      .map((rel) => rel.split('/')[2])
      .filter((name) => name && !name.startsWith('_')),
  );

  return {
    migrationFiles: migrationFiles.length,
    tables: [...tables].sort(),
    functions: [...functions].sort(),
    edgeFunctions: [...functionDirs].sort(),
  };
}

function getTypeDrift(files) {
  const sourceText = files
    .map((file) => toPosix(path.relative(root, file)))
    .filter((rel) => rel.startsWith('src/') || rel.startsWith('scripts/') || rel.startsWith('supabase/functions/'))
    .map((rel) => safeRead(rel))
    .join('\n');

  const usedTables = new Set();
  for (const match of sourceText.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const name = match[1];
    if (!name.includes('-')) usedTables.add(name);
  }

  const dbText = safeRead('src/types/database.ts');
  const typedTables = new Set();
  for (const match of dbText.matchAll(/^\s+([a-zA-Z_][\w]*):\s+TableModel</gm)) {
    typedTables.add(match[1]);
  }

  return {
    usedTables: [...usedTables].sort(),
    typedTables: [...typedTables].sort(),
    missingTypedTables: [...usedTables].filter((name) => !typedTables.has(name)).sort(),
  };
}

const files = walk(root);
const relFiles = files.map((file) => toPosix(path.relative(root, file)));
const srcFiles = relFiles.filter((rel) => rel.startsWith('src/'));
const pageFiles = relFiles.filter((rel) => rel.startsWith('src/pages/') && rel.endsWith('.tsx'));
const componentFiles = relFiles.filter((rel) => rel.startsWith('src/components/') && rel.endsWith('.tsx'));
const hookFiles = relFiles.filter((rel) => rel.startsWith('src/hooks/') && rel.endsWith('.ts'));
const migrationFiles = relFiles.filter((rel) => rel.startsWith('supabase/migrations/') && rel.endsWith('.sql'));
const schemaStats = getBackendSchemaStats(files);
const typeDrift = getTypeDrift(files);
const extStats = getExtStats(files);
const srcAreaStats = getSrcAreaStats(files);
const lineStats = getLineStats(files);
const routeStats = getRouteStats();
const totalLines = lineStats.reduce((sum, item) => sum + item.lines, 0);

const packageJson = JSON.parse(safeRead('package.json'));

const featureDomains = [
  ['Platform admin', 'xo_super_admin', 'Nursery CRUD, subscription/pricing setup, platform analytics, XO payment overview.'],
  ['Nursery operations', 'admin, manager', 'Dashboard, onboarding, classes, children, calendar, settings, role/position/feature admin.'],
  ['Admissions and enrollment', 'admin, parent', 'Public inquiry, parent signup, applications, waitlist, import, child enrollment wizard.'],
  ['Children and attendance', 'admin, teacher, parent', 'Child profiles, attendance dashboards, QR scanner, pickup verification, history.'],
  ['Staff and HR', 'admin, manager, staff', 'Staff directory, onboarding, schedules, attendance month view, payroll, payslips.'],
  ['Events and permissions', 'admin, parent, teacher', 'Event CRUD, parent event creation, permission responses, reminders, QR/event attendance, invoices.'],
  ['Finance and billing', 'admin, parent, xo_admin', 'Invoices, payment attempts, Paymob initiation, financial dashboard/reports, packages, loyalty.'],
  ['Reports and learning', 'teacher, parent, admin', 'Daily reports, feeding/nap/mood/toilet sections, milestones, quarterly reports, courses.'],
  ['Media and content', 'admin, teacher, parent', 'Upload, compression, privacy/visibility, approval, gallery, downloads, content library.'],
  ['Communication', 'all roles', 'Notifications, web push, chat, inbox/messages, broadcasts, email/SMS/WhatsApp dispatch.'],
  ['Surveys and forms', 'admin, parent', 'Survey builder, renderer, responses, analytics panel, targeted notifications.'],
  ['Health and safety', 'admin, parent, teacher', 'Allergies, conditions, medications, vaccinations, documents, alert dashboard, update requests.'],
  ['AI and help', 'all roles', 'Help articles, route tracker, AI assistant, AI action safety, AI import mapper.'],
  ['Backup and ops', 'admin, ops', 'Tenant export, usage watch, restore rehearsal, integrity and cross-tenant denial scripts.'],
  ['PWA, i18n, theming', 'all roles', 'Service worker, offline indicator/queue, Arabic/English locale files, RTL notes, theme switching.'],
];

const featureMatrix = [
  ['dashboard_attendance', 'full', 'full', 'full'],
  ['dashboard_finance', 'full', 'finance', 'none'],
  ['kids_applications', 'full', 'full', 'none'],
  ['staff', 'full', 'hr', 'none'],
  ['classes', 'full', 'full', 'full'],
  ['admissions', 'full', 'full', 'none'],
  ['event_calendar', 'full', 'full', 'full'],
  ['financial_reports', 'full', 'finance', 'none'],
  ['notifications', 'full', 'full', 'full'],
  ['media_library', 'full', 'full', 'approval'],
  ['upload_media', 'full', 'full', 'full'],
  ['content_library', 'full', 'full', 'full'],
  ['surveys', 'full', 'full', 'none'],
  ['messages', 'full', 'full', 'full'],
  ['daily_reports', 'full', 'full', 'approval'],
  ['child_enrollment', 'full', 'full', 'none'],
  ['staff_onboarding', 'full', 'full', 'none'],
  ['inventory', 'full', 'full', 'none'],
  ['meals', 'full', 'full', 'none'],
  ['qr_code', 'full', 'full', 'none'],
  ['health_alerts', 'full', 'full', 'full'],
  ['loyalty', 'full', 'finance', 'none'],
  ['broadcast_messages', 'full', 'full', 'none'],
];

const qualityFindings = [
  ['P0', 'Build blocked', 'npm run typecheck fails. TeacherLayout has missing names; DB type drift creates many Supabase never-row errors.'],
  ['P0', 'Teacher shell broken', 'TeacherLayout.tsx references useUnreadMessagesCount, teacherDisplayName, profile, and languagePref without valid definitions.'],
  ['P0', 'Supabase types stale', `Used backend objects missing from database.ts include: ${typeDrift.missingTypedTables.slice(0, 12).join(', ')}${typeDrift.missingTypedTables.length > 12 ? ', ...' : ''}.`],
  ['P1', 'Form type contracts', 'Staff onboarding and course forms have resolver/default-value mismatches. Use z.input/z.output or align form values with schema transforms.'],
  ['P1', 'Lint signal is high', 'npm run lint reports 110 problems: 78 errors and 32 warnings. Main clusters: React Hooks purity, set-state-in-effect, fast-refresh exports, unused values.'],
  ['P1', 'Schema migration drift', 'Many migrations add domain tables after the manual type file. Add automated Supabase type generation and a drift check in CI.'],
  ['P2', 'Documentation gap', 'README is still the default Vite template. Add architecture, environment setup, role matrix, feature map, and operational runbooks as first-class docs.'],
  ['P2', 'Feature sprawl risk', '106 hook files and broad admin surfaces are workable, but future work should move toward feature-owned modules with local hooks, UI, schemas, and tests.'],
];

const roadmap = [
  ['Week 1', 'Restore build health', 'Fix TeacherLayout, regenerate Supabase types, correct resolver generics, remove unused imports.'],
  ['Week 2', 'Stabilize quality gates', 'Make typecheck/lint required in CI; tune React Compiler lint policy; add smoke tests for route shells.'],
  ['Weeks 3-4', 'Vertical slice cleanup', 'Move admin/parent/teacher features into domain folders with shared UI kept small and intentional.'],
  ['Month 2', 'Database discipline', 'Canonical schema docs, generated types, migration review checklist, RLS regression tests.'],
  ['Month 3', 'Operational maturity', 'Backup restore rehearsal, edge-function observability, bundle budgets, role-permission audit UI.'],
];

const strategies = [
  ['Use feature slices', 'Group page + hooks + domain lib + schema near each feature. Keep src/components/ui for primitive reusable controls only.'],
  ['Generate database types', 'Replace hand-maintained Database tables with generated Supabase types; run drift check whenever migrations change.'],
  ['Keep route shells thin', 'Layouts should compose navigation, profile/session queries, notification drawers, and Outlet only. Move business logic into hooks.'],
  ['Define domain service modules', 'For each feature, isolate Supabase reads/writes in typed hooks or lib modules, not scattered across pages.'],
  ['Add contract tests', 'Cover RBAC gates, RLS-sensitive data access, payment/event flows, and onboarding validation before large refactors.'],
  ['Document ownership', 'Every feature gets owner, routes, tables, edge functions, and critical user flows in a short living doc.'],
];

const riskMatrix = [
  ['Build/type safety', 5, 5, 'Failing typecheck blocks reliable deploys.'],
  ['Tenant isolation/RLS', 5, 4, 'Many migrations target recursion/security. Needs regression tests.'],
  ['Payments/invoices', 5, 3, 'Financial flows exist across admin, parent, and XO admin.'],
  ['Notifications/dispatch', 4, 4, 'Email/SMS/WhatsApp/push need retry and audit trails.'],
  ['Feature growth', 3, 5, 'Lots of pages/hooks can become hard to reason about without ownership boundaries.'],
  ['Documentation', 3, 4, 'Current README does not describe the real system.'],
];

const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const pageHeight = doc.internal.pageSize.getHeight();
const margin = 42;
const contentWidth = pageWidth - margin * 2;
const colors = {
  ink: [28, 36, 49],
  muted: [94, 108, 132],
  border: [219, 226, 236],
  panel: [247, 249, 252],
  blue: [37, 99, 235],
  green: [20, 138, 94],
  amber: [217, 119, 6],
  red: [220, 38, 38],
  purple: [124, 58, 237],
  teal: [13, 148, 136],
  slate: [51, 65, 85],
};

function setText(color = colors.ink, size = 10, style = 'normal') {
  doc.setTextColor(...color);
  doc.setFont('helvetica', style);
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
  doc.line(margin, y + 8, margin + 42, y + 8);
  if (subtitle) {
    setText(colors.muted, 9);
    doc.text(doc.splitTextToSize(subtitle, contentWidth), margin, y + 24);
    return y + 44;
  }
  return y + 24;
}

function drawCard(x, y, w, h, title, value, note, accent = colors.blue) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 6, h, 3, 3, 'F');
  setText(colors.muted, 8, 'bold');
  doc.text(title.toUpperCase(), x + 16, y + 18);
  setText(colors.ink, 22, 'bold');
  doc.text(String(value), x + 16, y + 44);
  setText(colors.muted, 8);
  doc.text(doc.splitTextToSize(note, w - 24), x + 16, y + 61);
}

function drawBarChart(x, y, w, h, data, options = {}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const labelWidth = options.labelWidth ?? 116;
  const barWidth = w - labelWidth - 36;
  const rowH = h / data.length;
  data.forEach((item, index) => {
    const rowY = y + index * rowH + 4;
    setText(colors.slate, 8);
    doc.text(doc.splitTextToSize(item.label, labelWidth - 4), x, rowY + 10);
    doc.setFillColor(234, 240, 248);
    doc.roundedRect(x + labelWidth, rowY, barWidth, 10, 4, 4, 'F');
    const bw = (item.value / max) * barWidth;
    doc.setFillColor(...(item.color ?? colors.blue));
    doc.roundedRect(x + labelWidth, rowY, Math.max(2, bw), 10, 4, 4, 'F');
    setText(colors.muted, 8, 'bold');
    doc.text(String(item.value), x + labelWidth + barWidth + 8, rowY + 9);
  });
}

function drawStackedBar(x, y, w, h, segments) {
  const total = segments.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = x;
  segments.forEach((item) => {
    const segW = (item.value / total) * w;
    doc.setFillColor(...item.color);
    doc.rect(cursor, y, segW, h, 'F');
    cursor += segW;
  });
  let legendX = x;
  segments.forEach((item) => {
    doc.setFillColor(...item.color);
    doc.rect(legendX, y + h + 11, 7, 7, 'F');
    setText(colors.muted, 7);
    doc.text(`${item.label} (${item.value})`, legendX + 11, y + h + 18);
    legendX += Math.min(120, doc.getTextWidth(`${item.label} (${item.value})`) + 25);
  });
}

function drawFlow(x, y, w) {
  const boxes = [
    ['React/Vite PWA', 'Routes, layouts, feature pages'],
    ['React Query hooks', 'Typed data loading and mutation'],
    ['Supabase', 'Auth, Postgres, storage, realtime'],
    ['Edge Functions', 'AI, imports, dispatch, QR, exports'],
  ];
  const gap = 14;
  const boxW = (w - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((box, index) => {
    const bx = x + index * (boxW + gap);
    doc.setDrawColor(...colors.border);
    doc.setFillColor(index % 2 === 0 ? 247 : 250, 249, 252);
    doc.roundedRect(bx, y, boxW, 66, 8, 8, 'FD');
    setText(index === 2 ? colors.green : colors.blue, 10, 'bold');
    doc.text(box[0], bx + 10, y + 20);
    setText(colors.muted, 8);
    doc.text(doc.splitTextToSize(box[1], boxW - 20), bx + 10, y + 36);
    if (index < boxes.length - 1) {
      const ax = bx + boxW;
      doc.setDrawColor(...colors.muted);
      doc.line(ax + 3, y + 33, ax + gap - 3, y + 33);
      doc.triangle(ax + gap - 3, y + 30, ax + gap - 3, y + 36, ax + gap + 2, y + 33, 'F');
    }
  });
}

function drawHeatmap(x, y, rows) {
  const cellW = 54;
  const labelW = 134;
  const rowH = 17;
  const cols = ['Top mgmt', 'Manager', 'Teacher'];
  setText(colors.muted, 7, 'bold');
  cols.forEach((col, idx) => doc.text(col, x + labelW + idx * cellW + 4, y));
  rows.forEach((row, r) => {
    const yy = y + 11 + r * rowH;
    setText(colors.slate, 7);
    doc.text(compactLabel(row[0]).slice(0, 25), x, yy + 10);
    row.slice(1).forEach((access, c) => {
      let fill = [239, 244, 251];
      let text = '';
      if (access === 'full') {
        fill = [215, 246, 228];
        text = 'full';
      } else if (access === 'finance' || access === 'hr') {
        fill = [254, 243, 199];
        text = access;
      } else if (access === 'approval') {
        fill = [237, 233, 254];
        text = 'approval';
      } else {
        fill = [254, 226, 226];
        text = 'none';
      }
      doc.setFillColor(...fill);
      doc.roundedRect(x + labelW + c * cellW, yy, cellW - 5, 12, 3, 3, 'F');
      setText(access === 'none' ? colors.red : colors.ink, 6.5, 'bold');
      doc.text(text, x + labelW + c * cellW + 4, yy + 8.5);
    });
  });
}

function drawRiskMatrix(x, y, w, h, risks) {
  doc.setDrawColor(...colors.border);
  doc.setFillColor(250, 252, 255);
  doc.roundedRect(x, y, w, h, 8, 8, 'FD');
  setText(colors.muted, 7);
  doc.text('Likelihood', x + 8, y + 14);
  doc.text('Impact', x + w - 34, y + h - 8);
  doc.setDrawColor(230, 235, 244);
  for (let i = 1; i < 5; i += 1) {
    doc.line(x + (w / 5) * i, y, x + (w / 5) * i, y + h);
    doc.line(x, y + (h / 5) * i, x + w, y + (h / 5) * i);
  }
  risks.forEach((risk, index) => {
    const [, impact, likelihood] = risk;
    const px = x + ((likelihood - 0.5) / 5) * w;
    const py = y + h - ((impact - 0.5) / 5) * h;
    const palette = [colors.red, colors.amber, colors.blue, colors.green, colors.purple, colors.teal];
    doc.setFillColor(...palette[index % palette.length]);
    doc.circle(px, py, 5, 'F');
    setText(colors.ink, 6.5, 'bold');
    doc.text(String(index + 1), px + 7, py + 2);
  });
}

function drawRoadmap(x, y, w, items) {
  const gap = 8;
  const itemW = (w - gap * (items.length - 1)) / items.length;
  items.forEach((item, idx) => {
    const bx = x + idx * (itemW + gap);
    doc.setDrawColor(...colors.border);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(bx, y, itemW, 108, 8, 8, 'FD');
    doc.setFillColor(...[colors.blue, colors.green, colors.amber, colors.purple, colors.teal][idx % 5]);
    doc.rect(bx, y, itemW, 5, 'F');
    setText(colors.ink, 9, 'bold');
    doc.text(item[0], bx + 8, y + 20);
    setText(colors.blue, 8, 'bold');
    doc.text(doc.splitTextToSize(item[1], itemW - 16), bx + 8, y + 36);
    setText(colors.muted, 7);
    doc.text(doc.splitTextToSize(item[2], itemW - 16), bx + 8, y + 58);
  });
}

function table(head, body, startY, options = {}) {
  autoTable(doc, {
    head: [head],
    body,
    startY,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: options.fontSize ?? 7.5,
      cellPadding: 4,
      overflow: 'linebreak',
      minCellWidth: 6,
      lineColor: colors.border,
      lineWidth: 0.4,
      textColor: colors.ink,
    },
    tableWidth: contentWidth,
    headStyles: {
      fillColor: colors.slate,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: margin, right: margin },
    columnStyles: options.columnStyles ?? {},
  });
  return doc.lastAutoTable.finalY + 18;
}

function addFooters() {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...colors.border);
    doc.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    setText(colors.muted, 7);
    doc.text(`XO Platform feature and code audit - generated ${generatedAtLabel}`, margin, pageHeight - 20);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - margin - 46, pageHeight - 20);
  }
}

// Cover
doc.setFillColor(248, 250, 252);
doc.rect(0, 0, pageWidth, pageHeight, 'F');
doc.setFillColor(...colors.blue);
doc.rect(0, 0, pageWidth, 176, 'F');
setText([255, 255, 255], 30, 'bold');
doc.text('XO Platform', margin, 72);
setText([226, 237, 255], 16, 'bold');
doc.text('Feature Inventory, Graphic Statistics, and Clean Code Strategy', margin, 101);
setText([226, 237, 255], 10);
doc.text(`Generated from local repository on ${generatedAtLabel}`, margin, 126);

drawCard(margin, 210, 118, 90, 'Source files', srcFiles.length, 'Files inside src/.', colors.blue);
drawCard(margin + 132, 210, 118, 90, 'Screens', pageFiles.length, 'React page files.', colors.green);
drawCard(margin + 264, 210, 118, 90, 'Hooks', hookFiles.length, 'Data and UI hooks.', colors.purple);
drawCard(margin + 396, 210, 118, 90, 'Migrations', migrationFiles.length, 'SQL migration files.', colors.amber);

let y = 336;
setText(colors.ink, 15, 'bold');
doc.text('Executive Snapshot', margin, y);
y += 24;
setText(colors.muted, 10);
doc.text(
  doc.splitTextToSize(
    'This project is a multi-role nursery operations platform: React/Vite on the client, Supabase for Auth/Postgres/Storage/Realtime, and Supabase Edge Functions for operational workflows. The feature surface is broad and mature, but current build quality is blocked by TypeScript errors and database type drift.',
    contentWidth,
  ),
  margin,
  y,
);
y += 72;
drawFlow(margin, y, contentWidth);
y += 100;
setText(colors.ink, 12, 'bold');
doc.text('Current Verification Status', margin, y);
y += 14;
table(
  ['Check', 'Result', 'Meaning'],
  [
    ['npm run typecheck', 'FAIL', 'TypeScript build currently fails. Highest-impact issues: TeacherLayout missing names, stale Supabase database types, resolver/type mismatches.'],
    ['npm run lint', 'FAIL', '110 problems: 78 errors, 32 warnings. Main clusters: React Hooks purity/set-state-in-effect, Fast Refresh exports, unused values.'],
    ['PDF generation', 'PASS', 'This report was generated locally with jsPDF from repository files and observed command output.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 118 }, 1: { cellWidth: 64 }, 2: { cellWidth: 320 } }, fontSize: 8 },
);

// Statistics
addPage();
y = sectionTitle('Graphic Statistics', 58, 'Live counts from the repository excluding node_modules, dist, .git, and attached binary assets.');
drawStackedBar(
  margin,
  y,
  contentWidth,
  20,
  lineStats
    .filter((item) => item.lines > 0)
    .map((item, idx) => ({
      label: item.label,
      value: item.lines,
      color: [colors.blue, colors.green, colors.amber, colors.purple, colors.teal, colors.slate][idx % 6],
    })),
);
y += 62;
drawCard(margin, y, 118, 78, 'Total lines', totalLines.toLocaleString(), 'Text/code lines counted locally.', colors.slate);
drawCard(margin + 132, y, 118, 78, 'Components', componentFiles.length, 'Reusable TSX components.', colors.blue);
drawCard(margin + 264, y, 118, 78, 'Routes', routeStats.reduce((sum, item) => sum + item.value, 0), 'Declared app routes.', colors.green);
drawCard(margin + 396, y, 118, 78, 'Edge funcs', schemaStats.edgeFunctions.length, 'Supabase functions.', colors.purple);
y += 112;
setText(colors.ink, 12, 'bold');
doc.text('Routes by Audience', margin, y);
setText(colors.ink, 12, 'bold');
doc.text('Source Areas by File Count', margin + 278, y);
y += 14;
drawBarChart(margin, y, 230, 116, routeStats, { labelWidth: 94 });
drawBarChart(margin + 278, y, 230, 154, srcAreaStats.slice(0, 10), { labelWidth: 118 });
y += 176;
setText(colors.ink, 12, 'bold');
doc.text('Repository Code Mix', margin, y);
y += 12;
table(
  ['Area', 'Files', 'Lines'],
  lineStats.map((item) => [compactLabel(item.label), item.files.toLocaleString(), item.lines.toLocaleString()]),
  y,
  { columnStyles: { 0: { cellWidth: 250 }, 1: { cellWidth: 90 }, 2: { cellWidth: 110 } } },
);

// Feature inventory
addPage();
y = sectionTitle('Feature Inventory', 58, 'Grouped by product domain and primary audience. This is the readable map of the project surface.');
y = table(
  ['Feature domain', 'Audience', 'What exists in the codebase'],
  featureDomains,
  y,
  { columnStyles: { 0: { cellWidth: 118 }, 1: { cellWidth: 100 }, 2: { cellWidth: 292 } }, fontSize: 7.4 },
);

// Role matrix
addPage();
y = sectionTitle('Role and Permission View', 58, 'The current permission matrix is defined in src/lib/permissions/matrix.ts. XO super admin bypasses this matrix.');
drawHeatmap(margin, y + 4, featureMatrix.slice(0, 23));
y += 430;
setText(colors.ink, 12, 'bold');
doc.text('Permission Model Notes', margin, y);
y += 14;
setText(colors.muted, 9);
doc.text(
  doc.splitTextToSize(
    'Top management has full access across the feature matrix. Managers are mostly full access, with finance-only and HR-only exceptions. Teachers have direct classroom/attendance/event/report/media surfaces, with some report/media flows marked as approval-based. Parents are handled outside this admin matrix through parent-child relationships and protected parent routes.',
    contentWidth,
  ),
  margin,
  y,
);

// Backend
addPage();
y = sectionTitle('Backend and Data Shape', 58, 'Supabase is the operational backbone: typed client, SQL migrations, Edge Functions, storage buckets, and role-aware RLS helpers.');
drawCard(margin, y, 118, 78, 'DB tables', schemaStats.tables.length, 'Unique CREATE TABLE names found.', colors.green);
drawCard(margin + 132, y, 118, 78, 'SQL funcs', schemaStats.functions.length, 'Unique CREATE FUNCTION names.', colors.blue);
drawCard(margin + 264, y, 118, 78, 'Used tables', typeDrift.usedTables.length, 'Supabase .from(...) names in code.', colors.purple);
drawCard(margin + 396, y, 118, 78, 'Type drift', typeDrift.missingTypedTables.length, 'Used names missing from database.ts.', colors.red);
y += 112;
setText(colors.ink, 12, 'bold');
doc.text('Edge Function Map', margin, y);
y += 12;
table(
  ['Function', 'Likely responsibility'],
  schemaStats.edgeFunctions.map((name) => [
    name,
    {
      'ai-assistant': 'Help/AI assistant endpoint',
      'ai-import-mapper': 'AI-assisted import mapping',
      'child-enrollment-complete': 'Finalize child enrollment workflow',
      'email-dispatch': 'Email notification dispatch',
      'emergency-broadcast': 'Urgent broadcast workflow',
      'event-qr-issue': 'Issue QR tokens for events',
      'parent-signup-complete': 'Finalize public parent signup',
      'payment-reminders': 'Scheduled invoice/payment reminders',
      'permission-deadline-reminder': 'Event permission deadline reminders',
      'process-import': 'Spreadsheet/import job processor',
      'qr-token': 'QR token issuance',
      'qr-verify': 'QR verification and attendance/pickup handling',
      'sms-dispatch': 'SMS dispatch',
      'staff-onboarding-complete': 'Finalize staff onboarding workflow',
      'tenant-export': 'Tenant-scoped backup/export',
      'whatsapp-dispatch': 'WhatsApp dispatch',
    }[name] ?? 'Operational backend function',
  ]),
  y,
  { columnStyles: { 0: { cellWidth: 170 }, 1: { cellWidth: 340 } }, fontSize: 7.4 },
);
y = doc.lastAutoTable.finalY + 16;
setText(colors.ink, 12, 'bold');
doc.text('Database Type Drift - Highest Impact', margin, y);
y += 12;
table(
  ['Missing from src/types/database.ts', 'Why it matters'],
  typeDrift.missingTypedTables.slice(0, 18).map((name) => [
    name,
    'Code calls supabase.from(...) for this object, but TypeScript cannot infer rows/inserts/updates correctly.',
  ]),
  y,
  { columnStyles: { 0: { cellWidth: 190 }, 1: { cellWidth: 320 } }, fontSize: 7.2 },
);

// Quality findings
addPage();
y = sectionTitle('Clean Code Findings', 58, 'Prioritized issues and cleanup direction based on static inspection plus typecheck/lint output.');
y = table(
  ['Priority', 'Finding', 'Recommended fix'],
  qualityFindings,
  y,
  { columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 122 }, 2: { cellWidth: 340 } }, fontSize: 7.5 },
);
setText(colors.ink, 12, 'bold');
doc.text('Risk Map', margin, y);
drawRiskMatrix(margin, y + 14, 225, 160, riskMatrix);
setText(colors.ink, 9, 'bold');
doc.text('Legend', margin + 252, y + 22);
setText(colors.muted, 7.5);
riskMatrix.forEach((risk, idx) => {
  const yy = y + 40 + idx * 19;
  const palette = [colors.red, colors.amber, colors.blue, colors.green, colors.purple, colors.teal];
  doc.setFillColor(...palette[idx % palette.length]);
  doc.circle(margin + 258, yy - 3, 4, 'F');
  doc.text(`${idx + 1}. ${risk[0]} - ${risk[3]}`, margin + 268, yy);
});
y += 202;
setText(colors.ink, 12, 'bold');
doc.text('Immediate Fix Order', margin, y);
y += 14;
table(
  ['Order', 'Action', 'Benefit'],
  [
    ['1', 'Fix TeacherLayout missing imports/derived values.', 'Restores an app shell and removes hard compile errors.'],
    ['2', 'Regenerate or extend Supabase Database types for new tables/functions/views.', 'Clears the largest cluster of never-row TypeScript errors.'],
    ['3', 'Align form schemas with useForm generics in staff onboarding and courses.', 'Keeps validation, defaults, and submit payloads consistent.'],
    ['4', 'Decide React Compiler lint posture and fix repeated patterns deliberately.', 'Turns lint from noise into a dependable gate.'],
    ['5', 'Add smoke tests for each role route group.', 'Prevents broken shells/routes from reaching users.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 230 }, 2: { cellWidth: 236 } }, fontSize: 7.5 },
);

// Strategy
addPage();
y = sectionTitle('Best Structure Strategy', 58, 'A practical architecture direction for making the codebase easier to understand, change, and verify.');
drawRoadmap(margin, y, contentWidth, roadmap);
y += 134;
y = table(
  ['Strategy', 'How to apply it in this project'],
  strategies,
  y,
  { columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: 360 } }, fontSize: 7.8 },
);
setText(colors.ink, 12, 'bold');
doc.text('Recommended Target Folder Shape', margin, y);
y += 14;
setText(colors.muted, 8.4);
doc.text(
  [
    'src/features/attendance/{pages,components,hooks,api,types}.ts',
    'src/features/events/{pages,components,hooks,api,schemas}.ts',
    'src/features/finance/{pages,components,hooks,api,formatters}.ts',
    'src/components/ui/* for design-system primitives only',
    'src/lib/supabase/* for generated database types and shared client helpers',
    'tests/e2e/role-smoke.spec.ts and tests/rls/*.sql for regression coverage',
  ],
  margin,
  y,
);
y += 96;
setText(colors.ink, 12, 'bold');
doc.text('Definition of Clean for Future Work', margin, y);
y += 14;
table(
  ['Gate', 'Expectation'],
  [
    ['Typecheck', 'npm run typecheck passes before merge. Generated DB types are current.'],
    ['Lint', 'npm run lint has zero errors. Warnings are intentional and tracked.'],
    ['Feature ownership', 'Every route has a clear feature owner and linked tables/functions.'],
    ['Tests', 'High-risk flows have smoke or integration coverage: auth, RBAC, payments, event permissions, onboarding, imports.'],
    ['Docs', 'README explains the real app; docs/ contains feature inventory, setup, backup, and RLS notes.'],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 115 }, 1: { cellWidth: 395 } }, fontSize: 7.8 },
);

// Appendix
addPage();
y = sectionTitle('Appendix', 58, 'Machine-readable-ish details used to make the graphics.');
y = table(
  ['Package / stack item', 'Detected value'],
  [
    ['App name', packageJson.name],
    ['Build tool', 'Vite + React + TypeScript'],
    ['React', packageJson.dependencies.react],
    ['Router', packageJson.dependencies['react-router-dom']],
    ['Data fetching', packageJson.dependencies['@tanstack/react-query']],
    ['Backend client', packageJson.dependencies['@supabase/supabase-js']],
    ['Charts in app', packageJson.dependencies.recharts],
    ['PDF library in repo', `${packageJson.dependencies.jspdf} / autotable ${packageJson.dependencies['jspdf-autotable']}`],
    ['Internationalization', `${packageJson.dependencies.i18next} / ${packageJson.dependencies['react-i18next']}`],
  ],
  y,
  { columnStyles: { 0: { cellWidth: 170 }, 1: { cellWidth: 340 } }, fontSize: 7.8 },
);
y = doc.lastAutoTable.finalY + 14;
setText(colors.ink, 12, 'bold');
doc.text('File Type Counts', margin, y);
y += 12;
table(
  ['Extension', 'Files'],
  extStats.slice(0, 14).map((item) => [item.label, item.value.toLocaleString()]),
  y,
  { columnStyles: { 0: { cellWidth: 160 }, 1: { cellWidth: 90 } }, fontSize: 7.8 },
);

addFooters();

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));

console.log(`Wrote ${path.relative(root, outputPath)}`);
