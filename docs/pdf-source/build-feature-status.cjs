// Builds feature-status.html: XO Platform feature status & delivery plan.
// Edit the data below (statuses, tasks, hours), run `node build-feature-status.cjs`,
// then `build-pdfs.ps1 status` to print it to PDF.
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Plan settings
// ---------------------------------------------------------------------------
const REPORT_DATE = new Date(2026, 9, 12); // status as of 12 Oct 2026
const START_DATE = new Date(2026, 9, 13); // first working day of the plan
const HOURS_PER_DAY = 5;
const WORK_DAYS = [0, 1, 2, 3, 4]; // Sunday to Thursday
const DAYS_PER_WEEK = WORK_DAYS.length;

// ---------------------------------------------------------------------------
// Delivery phases and tasks. Hours are estimates for one developer working with AI tools.
// ---------------------------------------------------------------------------
const PHASES = [
  {
    id: 'P1', name: 'Urgent fixes', long: 'Security and production fixes', color: '#2a78d6',
    goal: 'Close the account-security gap and bring production in line with the code.',
    tasks: [
      ['T1.1', 'Apply the 12 waiting database updates and re-check the affected pages', 3],
      ['T1.2', 'Deploy the server functions (data export, QR codes, sign-up payments)', 3],
      ['T1.3', 'Secure accounts: unique first passwords, hide the public account list, lock demo logins', 12],
      ['T1.4', 'Database rules so the XO admin and managers can see applications and courses', 6],
      ['T1.5', 'Hide money figures from teachers on the admin dashboard', 4],
      ['T1.6', 'Stop pages from saving data just by being opened (QR codes, health records)', 5],
      ['T1.7', 'Repair nursery logo links that point to the old storage', 2],
      ['T1.8', 'Testing and fixes buffer', 5],
    ],
  },
  {
    id: 'P2', name: 'Finish what exists', long: 'Complete the partly built features', color: '#eb6834',
    goal: 'Every screen that exists today works end to end, in Arabic and English.',
    tasks: [
      ['T2.1', 'Test every saving action on a private local copy of the database', 14],
      ['T2.2', 'Forgot-password and reset-password pages', 6],
      ['T2.3', 'Friendly error screen instead of a blank page when something crashes', 3],
      ['T2.4', 'Turn a waitlist entry into an application in one step', 5],
      ['T2.5', 'Staff attendance export to Excel', 3],
      ['T2.6', 'Daily report download as PDF for parents', 5],
      ['T2.7', 'Milestone sharing card and teacher edit', 5],
      ['T2.8', 'Loyalty points expiry', 4],
      ['T2.9', 'Meal plans: daily items, allergens, clear weekly view', 8],
      ['T2.10', 'Inventory: categories, low-stock alerts, history', 8],
      ['T2.11', 'Content library: upload files and images', 6],
      ['T2.12', 'Community board: moderation and better posts', 5],
      ['T2.13', 'Mark failed imports and allow a retry', 3],
      ['T2.14', 'Readable text colors (29 places)', 2],
      ['T2.15', 'Testing and fixes buffer', 12],
    ],
  },
  {
    id: 'P3', name: 'Messaging & payments', long: 'Real messaging and online payments', color: '#1baf7a',
    goal: 'Messages reach parents outside the app, and online payments confirm themselves.',
    tasks: [
      ['T3.1', 'Email delivery (also powers the inquiry "Send email" button)', 8],
      ['T3.2', 'SMS delivery', 6],
      ['T3.3', 'WhatsApp delivery (including emergency broadcasts)', 10],
      ['T3.4', 'Push notifications to phones', 10],
      ['T3.5', 'Paymob: automatic payment confirmation through a secure callback', 12],
      ['T3.6', 'Paymob for monthly invoices, not only at sign-up', 10],
      ['T3.7', 'Daily payment reconciliation and alerts', 8],
      ['T3.8', 'Testing and fixes buffer', 10],
    ],
  },
  {
    id: 'P4', name: 'Quality & safety net', long: 'Tests, monitoring and safe releases', color: '#eda100',
    goal: 'Problems are caught before parents see them, and every release is traceable.',
    tasks: [
      ['T4.1', 'Make the automatic code checks block broken changes', 1],
      ['T4.2', 'Error monitoring with alerts', 4],
      ['T4.3', 'Database types generated from the real schema', 20],
      ['T4.4', 'Automated tests for payments and attendance logic', 16],
      ['T4.5', 'Database tests for access rules and money functions', 16],
      ['T4.6', 'End-to-end tests of the main journeys for every role', 16],
      ['T4.7', 'Version numbers and release notes', 3],
      ['T4.8', 'Testing and fixes buffer', 10],
    ],
  },
  {
    id: 'P5', name: 'Finance & HR controls', long: 'Finance and HR controls', color: '#e87ba4',
    goal: 'Every money and payroll change is recorded, reversible and approved.',
    tasks: [
      ['T5.1', 'Audit log for money and HR changes', 10],
      ['T5.2', 'Ledger with invoice lines, refunds and credit notes', 30],
      ['T5.3', 'Payroll approval by a second person', 12],
      ['T5.4', 'Summer pause in billing', 10],
      ['T5.5', 'Hourly and hybrid pricing in billing', 12],
      ['T5.6', 'Testing and fixes buffer', 10],
    ],
  },
  {
    id: 'P6', name: 'New features', long: 'New features from the partner interviews', color: '#008300',
    goal: 'The features planned after launch.',
    tasks: [
      ['T6.1', 'Medication given: photo proof sent to parents', 10],
      ['T6.2', 'Clinic return QR with a checklist', 10],
      ['T6.3', 'Substitute teacher suggestions', 8],
      ['T6.4', 'Invoice overlap detection', 8],
      ['T6.5', 'AI insights: patterns, flags and generated reports', 20],
      ['T6.6', 'Bus tracking', 40],
      ['T6.7', 'CCTV live cameras for parents', 60],
      ['T6.8', 'Testing and fixes buffer', 20],
    ],
  },
];

// ---------------------------------------------------------------------------
// Feature catalogue: the 15 business modules plus platform foundation.
// status: done | partial | fix | todo ; task: the task that completes it
// ---------------------------------------------------------------------------
const MODULES = [
  {
    n: 1, name: 'Admissions & enrollment', features: [
      ['Public inquiry form', 'done'],
      ['Inquiries list and follow-up', 'partial', 'The "Send email" button does not work yet', 'T3.1'],
      ['Waitlist', 'partial', 'No one-step conversion to an application', 'T2.4'],
      ['Online applications and review', 'fix', 'Managers and the XO admin cannot see applications', 'T1.4'],
      ['Document verification', 'done'],
      ['Parent self-registration (sign-up wizard)', 'done'],
      ['Child enrollment wizard', 'done'],
      ['Bulk import from Excel / CSV with AI column mapping', 'partial', 'A failed import is never marked as failed', 'T2.13'],
    ],
  },
  {
    n: 2, name: 'Child profiles & health', features: [
      ['Children list and full child record', 'done'],
      ['Health profile: allergies, conditions, medicines, vaccinations', 'done'],
      ['Health documents', 'done'],
      ['Health alerts dashboard', 'done'],
      ['Parent health view and update requests', 'done'],
      ['Photo privacy per child', 'done'],
      ['Opening a health page creates an empty record', 'fix', 'Should only save when someone saves', 'T1.6'],
      ['Medication given: photo proof to parents', 'todo', 'From the partner interviews', 'T6.1'],
      ['Clinic return QR with checklist', 'todo', 'From the partner interviews', 'T6.2'],
    ],
  },
  {
    n: 3, name: 'Classes & courses', features: [
      ['Classes list and class details', 'done'],
      ['Class staff: lead and assistant teachers', 'done'],
      ['Class announcements', 'done'],
      ['Teacher classes hub', 'done'],
      ['Courses: create, edit, enroll, invoices', 'partial', 'Works for branch admins; the XO admin and managers cannot see courses', 'T1.4'],
      ['Teacher and parent course views', 'done'],
    ],
  },
  {
    n: 4, name: 'Attendance & safe pickup', features: [
      ['QR check-in and check-out with the camera scanner', 'done'],
      ['Teacher attendance screen', 'fix', 'Teachers cannot load their children; the fix is written', 'T1.1'],
      ['Manual 6-digit codes', 'fix', 'Built; waiting for the database update', 'T1.1'],
      ['Attendance dashboard, logs and child reports', 'done'],
      ['Parent attendance history', 'done'],
      ['Delegated pickup QR with ID photos', 'done'],
      ['Late pickup fees and pickup reminders', 'done'],
      ['Automatic daily close', 'done'],
      ['QR pages create a permanent pickup code when opened', 'fix', 'Codes should be created on request only', 'T1.6'],
      ['Bus tracking', 'todo', 'Deferred to after launch', 'T6.6'],
    ],
  },
  {
    n: 5, name: 'Daily care & learning progress', features: [
      ['Teacher daily report editor', 'fix', 'Blocked by the teacher children problem; fix written', 'T1.1'],
      ['Parent daily reports with reactions', 'done'],
      ['Daily report PDF download', 'todo', 'The button shows "coming soon"', 'T2.6'],
      ['Quarterly progress reports', 'done'],
      ['Milestones: record and timeline', 'done'],
      ['Milestone sharing and teacher edit', 'todo', 'The buttons show "coming soon"', 'T2.7'],
      ['Meal plans', 'partial', 'Basic weekly text only', 'T2.9'],
    ],
  },
  {
    n: 6, name: 'Packages, pricing & deals', features: [
      ['Tuition packages and billing periods', 'done'],
      ['Deals and discounts', 'done'],
      ['Bulk tuition assignment', 'done'],
      ['Package and deal must belong to the same nursery', 'fix', 'Built; waiting for the database update', 'T1.1'],
      ['Summer pause in billing', 'todo', 'The setting exists; billing ignores it', 'T5.4'],
      ['Hourly and hybrid pricing', 'todo', 'The setting exists; billing ignores it', 'T5.5'],
    ],
  },
  {
    n: 7, name: 'Billing, payments & finance', features: [
      ['Invoices: list and create', 'done'],
      ['Invoice details', 'fix', 'Payment attempts fail to load until the database update', 'T1.1'],
      ['Cash and bank transfer payments', 'done'],
      ['InstaPay, Fawry and Etisalat Cash', 'fix', 'Built; waiting for the database update', 'T1.1'],
      ['Admin confirms or rejects payments', 'done'],
      ['Automatic monthly tuition billing', 'done'],
      ['Payment reminders', 'done'],
      ['Financial dashboard and reports', 'done'],
      ['Paymob online payment', 'partial', 'Sign-up only; payments are confirmed by hand', 'T3.6'],
      ['Daily payment reconciliation', 'todo', '', 'T3.7'],
      ['Audit log, ledger, refunds and credit notes', 'todo', '', 'T5.2'],
      ['Invoice overlap detection', 'todo', 'From the partner interviews', 'T6.4'],
    ],
  },
  {
    n: 8, name: 'Staff & HR', features: [
      ['Staff directory and profiles', 'done'],
      ['Staff onboarding wizard', 'fix', 'Every new staff member gets the same password', 'T1.3'],
      ['Staff documents and schedules', 'done'],
      ['Staff attendance', 'partial', 'Excel export not built', 'T2.5'],
      ['Payroll and payslips', 'fix', 'Double-payment protection is waiting for the database update', 'T1.1'],
      ['Payroll approval by a second person', 'todo', '', 'T5.3'],
      ['Substitute teacher suggestions', 'todo', 'From the partner interviews', 'T6.3'],
    ],
  },
  {
    n: 9, name: 'Communication & notifications', features: [
      ['Chat and inboxes', 'done'],
      ['Broadcast messages and history', 'done'],
      ['In-app notifications and reminders', 'done'],
      ['Email delivery', 'todo', 'Prepared but sends nothing yet', 'T3.1'],
      ['SMS delivery', 'todo', 'Prepared but sends nothing yet', 'T3.2'],
      ['WhatsApp delivery', 'todo', 'Prepared but sends nothing yet', 'T3.3'],
      ['Push notifications to phones', 'partial', 'Phones can subscribe; nothing is sent', 'T3.4'],
      ['Emergency broadcast', 'partial', 'In the app only; outside channels not sent', 'T3.3'],
    ],
  },
  {
    n: 10, name: 'Events & parent permissions', features: [
      ['Create and edit events, calendar', 'done'],
      ['Parent permission slips', 'done'],
      ['Permission deadline reminders', 'done'],
      ['Event QR check-in', 'done'],
      ['Paid events and invoices', 'done'],
      ['Parent event requests', 'done'],
    ],
  },
  {
    n: 11, name: 'Media, content & community', features: [
      ['Photo and video upload', 'done'],
      ['Media approval before parents see it', 'done'],
      ['Media library and parent gallery', 'done'],
      ['Surveys', 'done'],
      ['Content library', 'partial', 'Text and links only, no file upload', 'T2.11'],
      ['Community board', 'partial', 'Basic version', 'T2.12'],
    ],
  },
  {
    n: 12, name: 'Loyalty & rewards', features: [
      ['Points for payments and referrals', 'done'],
      ['Rewards and redemption', 'done'],
      ['Points expiry', 'todo', '', 'T2.8'],
    ],
  },
  {
    n: 13, name: 'Nursery settings & operations', features: [
      ['Six-step nursery onboarding', 'done'],
      ['Nursery profile, logo and social links', 'done'],
      ['Admin dashboard: today, alerts and activity', 'done'],
      ['Settings: hours, attendance, billing, notifications', 'done'],
      ['Data export (backup)', 'fix', 'The export service is not deployed', 'T1.2'],
      ['Inventory', 'partial', 'Basic stock count only', 'T2.10'],
      ['CCTV live cameras', 'todo', 'Deferred to after launch', 'T6.7'],
    ],
  },
  {
    n: 14, name: 'Multi-branch & platform administration', features: [
      ['Nursery list, create, edit and details', 'done'],
      ['Platform analytics and payments', 'done'],
      ['Switch into any nursery', 'done'],
      ['Roles editor', 'done', 'Rebuilt this week'],
      ['Positions and feature catalogue', 'done'],
      ['Database permissions for applications and courses', 'fix', 'Missing for the XO admin and managers', 'T1.4'],
      ['Teachers can see nursery money totals', 'fix', 'On the admin dashboard', 'T1.5'],
      ['Nursery logo links', 'fix', 'Point to the old storage', 'T1.7'],
    ],
  },
  {
    n: 15, name: 'AI help assistant', features: [
      ['In-app assistant that can take actions', 'done'],
      ['Safety confirmation and daily limit', 'done'],
      ['Help articles panel', 'done'],
      ['AI column mapping for bulk import', 'done'],
      ['AI insights: patterns, flags and reports', 'todo', 'From the partner interviews', 'T6.5'],
    ],
  },
  {
    n: 16, name: 'Platform foundation, security & quality', features: [
      ['Sign-in and a home page for each role', 'done'],
      ['Pages blocked for the wrong role', 'done'],
      ['Arabic and English, right-to-left layout', 'done'],
      ['Light and dark theme', 'done'],
      ['Install as an app, works offline', 'done'],
      ['Code checks: 0 errors', 'done', 'Fixed 11 Oct 2026'],
      ['Account security', 'fix', 'Shared password and a public account list', 'T1.3'],
      ['Production database up to date', 'fix', '12 updates waiting', 'T1.1'],
      ['Server functions deployed', 'fix', 'Data export missing; newer versions waiting', 'T1.2'],
      ['Readable text colors', 'fix', 'Pale text in 29 places', 'T2.14'],
      ['Forgot-password flow', 'todo', '', 'T2.2'],
      ['Friendly error screen', 'todo', 'A crash shows a blank page', 'T2.3'],
      ['Full test of saving actions', 'todo', '', 'T2.1'],
      ['Code checks block broken changes', 'todo', '', 'T4.1'],
      ['Error monitoring', 'todo', '', 'T4.2'],
      ['Database types from the real schema', 'todo', '', 'T4.3'],
      ['Automated tests', 'todo', '', 'T4.6'],
      ['Version numbers and release notes', 'todo', '', 'T4.7'],
    ],
  },
];

// ---------------------------------------------------------------------------
// Scheduling: tasks back to back, 5 hours a day, Sunday to Thursday
// ---------------------------------------------------------------------------
function isWorkDay(d) { return WORK_DAYS.includes(d.getDay()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Working days from the Sunday of the start week; index 0 = that Sunday.
const firstSunday = addDays(START_DATE, -START_DATE.getDay());
const startOffset = (() => { let i = 0; for (let d = new Date(firstSunday); d < START_DATE; d = addDays(d, 1)) if (isWorkDay(d)) i++; return i; })();
function dateOfWorkIndex(idx) {
  let d = new Date(firstSunday);
  let i = -1;
  for (;;) {
    if (isWorkDay(d)) { i++; if (i === idx) return d; }
    d = addDays(d, 1);
  }
}

const tasks = [];
let hour = 0;
for (const phase of PHASES) {
  phase.hours = 0;
  phase.items = [];
  for (const [id, name, hours] of phase.tasks) {
    const startIdx = startOffset + Math.floor(hour / HOURS_PER_DAY);
    const endIdx = startOffset + Math.ceil((hour + hours) / HOURS_PER_DAY) - 1;
    const t = { id, name, hours, phase, startIdx, endIdx, start: dateOfWorkIndex(startIdx), end: dateOfWorkIndex(endIdx), features: [] };
    hour += hours;
    phase.hours += hours;
    phase.items.push(t);
    tasks.push(t);
  }
  phase.startIdx = phase.items[0].startIdx;
  phase.endIdx = phase.items[phase.items.length - 1].endIdx;
  phase.start = phase.items[0].start;
  phase.end = phase.items[phase.items.length - 1].end;
}
const TOTAL_HOURS = hour;
const taskById = new Map(tasks.map((t) => [t.id, t]));
const lastIdx = tasks[tasks.length - 1].endIdx;
const WEEKS = Math.ceil((lastIdx + 1) / DAYS_PER_WEEK);
const AXIS_DAYS = WEEKS * DAYS_PER_WEEK;
const todayIdx = (() => { let i = 0; for (let d = new Date(firstSunday); d < REPORT_DATE; d = addDays(d, 1)) if (isWorkDay(d)) i++; return i; })();

// Link features to tasks and compute module stats
const STATUS = {
  done: { label: 'Complete', color: '#0ca30c', weight: 1 },
  partial: { label: 'Partly done', color: '#fab219', weight: 0.5 },
  fix: { label: 'Needs fix', color: '#d03b3b', weight: 0.5 },
  todo: { label: 'Not started', color: '#c9c8c1', weight: 0 },
};
const ORDER = ['done', 'partial', 'fix', 'todo'];
const totals = { done: 0, partial: 0, fix: 0, todo: 0, all: 0, score: 0 };
for (const m of MODULES) {
  m.items = m.features.map(([name, status, note = '', task = null]) => {
    const t = task ? taskById.get(task) : null;
    if (task && !t) throw new Error(`Unknown task ${task} for "${name}"`);
    if (status !== 'done' && !t) throw new Error(`"${name}" is ${status} but has no task`);
    if (t) t.features.push({ module: m, name });
    return { name, status, note, task: t };
  });
  m.counts = { done: 0, partial: 0, fix: 0, todo: 0 };
  for (const f of m.items) { m.counts[f.status]++; totals[f.status]++; totals.all++; totals.score += STATUS[f.status].weight; }
  m.score = m.items.reduce((s, f) => s + STATUS[f.status].weight, 0) / m.items.length;
  const open = m.items.filter((f) => f.task);
  m.tasks = [...new Set(open.map((f) => f.task))].sort((a, b) => a.startIdx - b.startIdx);
  m.finish = m.tasks.length ? m.tasks.reduce((a, t) => (t.endIdx > a.endIdx ? t : a)).end : null;
  m.firstStart = m.tasks.length ? m.tasks[0].start : null;
}
const OVERALL = totals.score / totals.all;
const CORE_END = PHASES[4].end;
const ALL_END = PHASES[5].end;

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Day and month; the year is added when it differs from the plan's start year.
const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== START_DATE.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
// A range shows the year once, on the end date when both dates share it.
const fmtRange = (a, b) => `${a.getFullYear() === b.getFullYear() ? `${a.getDate()} ${MONTHS[a.getMonth()]}` : fmt(a)} – ${fmt(b)}`;
const fmtY = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const fmtLong = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const xPct = (idx) => (idx / AXIS_DAYS) * 100;
const weeksOf = (h) => h / (HOURS_PER_DAY * DAYS_PER_WEEK);

function icon(status) {
  const c = STATUS[status].color;
  if (status === 'done') return `<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="${c}"/><path d="M3.3 6.2l1.8 1.8 3.6-3.7" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (status === 'partial') return `<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.25" fill="#fff" stroke="${c}" stroke-width="1.5"/><path d="M6 0.75a5.25 5.25 0 0 1 0 10.5z" fill="${c}"/></svg>`;
  if (status === 'fix') return `<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="6" fill="${c}"/><path d="M6 3v3.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="8.8" r="0.95" fill="#fff"/></svg>`;
  return `<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5.2" fill="#fff" stroke="#8a8f9c" stroke-width="1.4" stroke-dasharray="2.2 1.6"/></svg>`;
}
const chip = (status) => `<span class="st ${status}">${icon(status)}${STATUS[status].label}</span>`;

function stack(counts, total, cls = '') {
  const segs = ORDER.filter((s) => counts[s] > 0)
    .map((s) => `<span class="${s}" style="flex-grow:${counts[s]}" title="${STATUS[s].label}: ${counts[s]}"></span>`)
    .join('');
  return `<div class="stack ${cls}" role="img" aria-label="${ORDER.map((s) => `${STATUS[s].label} ${counts[s]}`).join(', ')} of ${total}">${segs}</div>`;
}

function weekGrid(extraClass = '') {
  let lines = '';
  for (let w = 1; w < WEEKS; w++) lines += `<i style="left:${(w / WEEKS) * 100}%"></i>`;
  return `<div class="wgrid ${extraClass}">${lines}</div>`;
}

function monthHeader() {
  // Group week columns by the month of each week's Sunday.
  const spans = [];
  for (let w = 0; w < WEEKS; w++) {
    const sunday = addDays(firstSunday, w * 7);
    const key = `${sunday.getFullYear()}-${sunday.getMonth()}`;
    // The year appears on January only; the first month's column is too narrow for it.
    const label = `${MONTHS[sunday.getMonth()]}${sunday.getMonth() === 0 ? ` ${sunday.getFullYear()}` : ''}`;
    if (spans.length && spans[spans.length - 1].key === key) spans[spans.length - 1].n++;
    else spans.push({ key, label, from: w, n: 1 });
  }
  const months = spans.map((s) => `<span style="left:${(s.from / WEEKS) * 100}%;width:${(s.n / WEEKS) * 100}%">${s.label}</span>`).join('');
  let weeks = '';
  for (let w = 0; w < WEEKS; w++) weeks += `<span style="left:${(w / WEEKS) * 100}%;width:${100 / WEEKS}%">${w + 1}</span>`;
  return `<div class="axis"><div class="months">${months}</div><div class="weeks">${weeks}</div></div>`;
}

function miniStrip(taskList) {
  const bars = taskList
    .map((t) => `<span style="left:${xPct(t.startIdx)}%;width:max(${xPct(t.endIdx + 1) - xPct(t.startIdx)}%,2px);background:${t.phase.color}"></span>`)
    .join('');
  return `<div class="strip">${weekGrid('faint')}${bars}<b class="today" style="left:${xPct(todayIdx)}%"></b></div>`;
}

// A task's bar within its own phase, one tick per working day, so short tasks stay visible.
function phaseStrip(t) {
  const from = t.phase.startIdx;
  const span = t.phase.endIdx + 1 - from;
  let ticks = '';
  for (let d = 1; d < span; d++) ticks += `<i style="left:${(d / span) * 100}%"></i>`;
  const left = ((t.startIdx - from) / span) * 100;
  const width = ((t.endIdx + 1 - t.startIdx) / span) * 100;
  return `<div class="strip zoom"><div class="wgrid faint">${ticks}</div><span style="left:${left}%;width:${width}%;background:${t.phase.color}"></span></div>`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
const doneCount = totals.done;
const openModules = MODULES.filter((m) => m.tasks.length);

const cover = `
<section class="cover">
  <div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div><div class="dotgrid"></div>
  <div class="brandmark"><div class="logo">XO</div>XO Platform</div>
  <div class="kind">Feature status &amp; delivery plan</div>
  <h1>Where XO stands,<br/>and what comes next</h1>
  <p class="subtitle">Every feature of the nursery platform, grouped into its business module, with what is complete, what still needs work, and a dated plan to finish it at 5 hours a day, 5 days a week.</p>
  <div class="cover-stats">
    <div><b>${pct(OVERALL)}</b><span>overall progress</span></div>
    <div><b>${doneCount} of ${totals.all}</b><span>features complete</span></div>
    <div><b>${TOTAL_HOURS} h</b><span>work left, about ${Math.ceil(weeksOf(TOTAL_HOURS))} weeks</span></div>
    <div><b>${fmt(CORE_END)}</b><span>core plan done (${CORE_END.getFullYear()})</span></div>
  </div>
  <div class="meta">
    <div>Document<b>Status &amp; delivery plan</b></div>
    <div>Date<b>${fmtY(REPORT_DATE)}</b></div>
    <div>Capacity<b>25 h a week (5 days × 5 h)</b></div>
    <div>Audience<b>Owner, partners &amp; team</b></div>
  </div>
</section>`;

const legend = `<div class="legend">${ORDER.map((s) => `<span>${chip(s)}</span>`).join('')}</div>`;

const summaryRows = MODULES.map((m) => `
  <tr>
    <td class="num">${String(m.n).padStart(2, '0')}</td>
    <td class="k">${esc(m.name)}</td>
    <td class="bar">${stack(m.counts, m.items.length)}</td>
    <td class="r">${pct(m.score)}</td>
    <td class="c">${m.counts.done}</td><td class="c">${m.counts.partial}</td><td class="c">${m.counts.fix}</td><td class="c">${m.counts.todo}</td>
    <td class="r muted">${m.finish ? fmt(m.finish) : '<span class="ok">Complete</span>'}</td>
  </tr>`).join('');

const glance = `
<section class="chapter">
  <div class="chapter-head"><div class="chapter-num">1</div><div><p class="eyebrow">At a glance</p><h1>Progress by module</h1></div></div>
  <p class="lead">${totals.all} features across 16 modules. ${doneCount} are complete and working. ${totals.fix} are built but need a fix before they can be trusted, ${totals.partial} are partly done, and ${totals.todo} are not started. Progress counts a complete feature as 1 and a partly done or needs-fix feature as half.</p>
  <div class="grid-4 stats">
    <div class="stat"><b>${pct(OVERALL)}</b><span>overall progress</span></div>
    <div class="stat"><b>${doneCount}</b><span>complete</span></div>
    <div class="stat"><b>${totals.fix + totals.partial}</b><span>need a fix or more work</span></div>
    <div class="stat"><b>${totals.todo}</b><span>not started</span></div>
  </div>
  ${legend}
  <table class="t summary">
    <thead><tr><th></th><th>Module</th><th>Status of its features</th><th class="r">Progress</th><th class="c" title="Complete">${icon('done')}</th><th class="c" title="Partly done">${icon('partial')}</th><th class="c" title="Needs fix">${icon('fix')}</th><th class="c" title="Not started">${icon('todo')}</th><th class="r">Finishes</th></tr></thead>
    <tbody>${summaryRows}</tbody>
    <tfoot><tr><td></td><td class="k">All modules</td><td class="bar">${stack(totals, totals.all)}</td><td class="r"><b>${pct(OVERALL)}</b></td><td class="c"><b>${totals.done}</b></td><td class="c"><b>${totals.partial}</b></td><td class="c"><b>${totals.fix}</b></td><td class="c"><b>${totals.todo}</b></td><td class="r"><b>${fmt(ALL_END)}</b></td></tr></tfoot>
  </table>
  <p class="small muted">"Finishes" is the date the last remaining task for that module ends in the plan in chapter 3.</p>
</section>`;

const highlights = `
<section class="chapter">
  <div class="chapter-head"><div class="chapter-num">2</div><div><p class="eyebrow">What this means</p><h1>The picture in three parts</h1></div></div>
  <div class="grid-3 tri">
    <div class="card good-card"><span class="tag">Working well</span><h3>The daily nursery runs on XO</h3>
      <ul class="dots tight">
        <li>Admissions, sign-up, enrollment and child records</li>
        <li>QR attendance, safe pickup and late-pickup billing</li>
        <li>Events with digital permission slips</li>
        <li>Invoices, manual payments, reminders and finance reports</li>
        <li>Staff records, payroll and payslips</li>
        <li>Chat, broadcasts and in-app notifications</li>
        <li>Photos with approval, daily and quarterly reports</li>
        <li>Arabic and English, every role on its own home page</li>
      </ul></div>
    <div class="card fix-card"><span class="tag">Fix first</span><h3>Problems found on ${fmt(REPORT_DATE)}</h3>
      <ul class="dots tight">
        <li><b>Account security:</b> new staff share one password and the account list is public</li>
        <li><b>Teachers</b> cannot load their children (fix written)</li>
        <li><b>12 database updates</b> are not in production yet</li>
        <li><b>XO admin and managers</b> cannot see applications or courses</li>
        <li><b>Teachers</b> can see nursery money totals</li>
        <li><b>Data export</b> service not deployed</li>
      </ul>
      <p class="small">All of these are in phase 1, which ends ${fmtLong(PHASES[0].end)}.</p></div>
    <div class="card todo-card"><span class="tag">Not built yet</span><h3>Gaps that limit growth</h3>
      <ul class="dots tight">
        <li>Email, SMS and WhatsApp delivery</li>
        <li>Push notifications to phones</li>
        <li>Automatic online payment confirmation</li>
        <li>Forgot-password flow</li>
        <li>Automated tests and error monitoring</li>
        <li>Ledger, refunds and payroll approval</li>
        <li>CCTV, bus tracking and the other interview features</li>
      </ul></div>
  </div>
  <div class="callout warn"><b>Recommendation</b><p>Do phase 1 before onboarding another nursery. Phases 1 to 5 make the platform complete and safe to scale (done around ${fmtLong(CORE_END)}). Phase 6 adds new features and can move as priorities change.</p></div>
  <h2>How the statuses were decided</h2>
  <p>Each status comes from a review of the code and a live check on ${fmt(REPORT_DATE)} ${REPORT_DATE.getFullYear()}: 401 pages were opened as seven kinds of user (public visitor, XO admin, branch admin, finance manager, HR manager, teacher and parent), read-only, with a screenshot of every page. Saving actions (forms, payments, attendance) were not exercised on production; testing them on a private copy is task T2.1.</p>
  <table class="t compact defs">
    <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td>${chip('done')}</td><td>Built and working for the people who use it.</td></tr>
      <tr><td>${chip('partial')}</td><td>Works, but a part is missing or still basic.</td></tr>
      <tr><td>${chip('fix')}</td><td>Built, but broken, unsafe or waiting for a production update.</td></tr>
      <tr><td>${chip('todo')}</td><td>Planned, no code yet, or the code only prepares for it.</td></tr>
    </tbody>
  </table>
</section>`;

// ---------- Timeline overview ----------
const phaseLanes = PHASES.map((p) => {
  const left = xPct(p.startIdx);
  const width = xPct(p.endIdx + 1) - left;
  return `
  <div class="lane">
    <div class="lane-label"><span class="sw" style="background:${p.color}"></span><b>${p.id}</b> ${esc(p.name)}</div>
    <div class="lane-track">${weekGrid()}<span class="pbar" style="left:${left}%;width:${width}%;background:${p.color}"></span>
      <span class="ms" style="left:${xPct(p.endIdx + 1)}%"></span>
    </div>
    <div class="lane-dates">${fmtRange(p.start, p.end)}<br/><span class="muted">${p.hours} h · ${weeksOf(p.hours).toFixed(1)} wk</span></div>
  </div>`;
}).join('');

const timeline = `
<section class="chapter">
  <div class="chapter-head"><div class="chapter-num">3</div><div><p class="eyebrow">Delivery plan</p><h1>Timeline</h1></div></div>
  <p class="lead">${TOTAL_HOURS} hours of remaining work in six phases, worked one task at a time at 5 hours a day, Sunday to Thursday (25 hours a week), starting ${fmtLong(START_DATE)}.</p>
  <div class="grid-4 stats">
    <div class="stat"><b>${fmt(PHASES[0].end)}</b><span>urgent fixes done</span></div>
    <div class="stat"><b>${fmt(PHASES[1].end)}</b><span>existing features complete</span></div>
    <div class="stat"><b>${fmt(CORE_END)}</b><span>core plan done (P1–P5)</span></div>
    <div class="stat"><b>${fmt(ALL_END)}</b><span>everything, with new features</span></div>
  </div>
  <div class="gantt">
    <div class="lane head"><div class="lane-label muted small">Phase</div><div class="lane-track axis-wrap">${monthHeader()}</div><div class="lane-dates muted small">Dates · effort</div></div>
    ${phaseLanes}
    <div class="lane foot"><div class="lane-label"></div><div class="lane-track"><b class="today big" style="left:${xPct(todayIdx)}%"><em>Today</em></b></div><div class="lane-dates"></div></div>
  </div>
  <p class="small muted">Week numbers count from the week of ${fmt(firstSunday)}. A diamond marks the end of each phase. Every bar and its dates are listed task by task in chapter 5.</p>
  <h2>Phases</h2>
  <table class="t compact phases">
    <thead><tr><th>Phase</th><th>Goal</th><th class="r">Hours</th><th>Start</th><th>Finish</th></tr></thead>
    <tbody>${PHASES.map((p) => `<tr><td class="k"><span class="sw" style="background:${p.color}"></span>${p.id} · ${esc(p.name)}</td><td>${esc(p.goal)}</td><td class="r">${p.hours}</td><td class="nowrap">${fmt(p.start)}</td><td class="nowrap">${fmt(p.end)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td class="k">Total</td><td></td><td class="r"><b>${TOTAL_HOURS}</b></td><td class="nowrap">${fmt(START_DATE)}</td><td class="nowrap"><b>${fmt(ALL_END)}</b></td></tr></tfoot>
  </table>
</section>`;

// ---------- Feature catalogue ----------
const moduleCards = MODULES.map((m) => {
  const rows = m.items.map((f) => `
      <tr class="${f.status}">
        <td class="fname">${esc(f.name)}${f.note ? `<span class="note">${esc(f.note)}</span>` : ''}</td>
        <td class="fst">${chip(f.status)}</td>
        <td class="ftask">${f.task ? `<span class="tid" style="--c:${f.task.phase.color}">${f.task.id}</span>` : ''}</td>
        <td class="fdate">${f.task ? fmt(f.task.end) : '<span class="ok">Done</span>'}</td>
      </tr>`).join('');
  const window = m.tasks.length
    ? `<div class="mwin"><span class="muted">Remaining work</span> <b>${fmtRange(m.firstStart, m.finish)}</b></div>${miniStrip(m.tasks)}`
    : `<div class="mwin"><span class="ok">Complete: no remaining work</span></div>`;
  return `
  <div class="mod${m.items.length >= 10 ? " long" : ""}">
    <div class="mod-head">
      <div class="mnum">${String(m.n).padStart(2, '0')}</div>
      <div class="mtitle"><h3>${esc(m.name)}</h3>
        <div class="mmeta">${stack(m.counts, m.items.length, 'thin')}<span><b>${pct(m.score)}</b> · ${m.counts.done} of ${m.items.length} complete</span></div>
      </div>
      <div class="mside">${window}</div>
    </div>
    <table class="ftable">
      <thead><tr><th>Feature</th><th>Status</th><th>Task</th><th>Target</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}).join('');

const catalogue = `
<section class="chapter">
  <div class="chapter-head"><div class="chapter-num">4</div><div><p class="eyebrow">Feature catalogue</p><h1>Every feature, module by module</h1></div></div>
  <p class="lead">Each module lists its features with their status. Unfinished features show the task that completes them and its target date; the strip shows when that work happens in the plan.</p>
  ${legend}
  ${moduleCards}
</section>`;

// ---------- Detailed schedule ----------
const scheduleBlocks = PHASES.map((p) => `
  <div class="sched">
    <div class="sched-head"><span class="sw lg" style="background:${p.color}"></span><div><h3>${p.id} · ${esc(p.long)}</h3><p>${fmtLong(p.start)} – ${fmtLong(p.end)} · ${p.hours} hours</p></div></div>
    <table class="t compact stable">
      <thead><tr><th>Task</th><th>What gets done</th><th class="r">Hours</th><th>Start</th><th>Finish</th><th class="tl">Within the phase</th></tr></thead>
      <tbody>${p.items.map((t) => `
        <tr>
          <td class="k">${t.id}</td>
          <td>${esc(t.name)}${t.features.length ? `<span class="feeds">Completes: ${t.features.map((f) => `${String(f.module.n).padStart(2, '0')} ${esc(f.name)}`).join(' · ')}</span>` : ''}</td>
          <td class="r">${t.hours}</td>
          <td class="nowrap">${fmt(t.start)}</td>
          <td class="nowrap">${fmt(t.end)}</td>
          <td class="tl">${phaseStrip(t)}</td>
        </tr>`).join('')}</tbody>
    </table>
  </div>`).join('');

const schedule = `
<section class="chapter">
  <div class="chapter-head"><div class="chapter-num">5</div><div><p class="eyebrow">Delivery plan</p><h1>Task-by-task schedule</h1></div></div>
  <p class="lead">Every task with its estimate and dates, phase by phase. The small bar in each row spans that phase, one tick per working day, so you can see when each task happens inside it. The timeline in chapter 3 shows how the phases follow each other.</p>
  ${scheduleBlocks}
</section>`;

// ---------- Assumptions ----------
const assumptions = `
<section class="chapter">
  <div class="chapter-head"><div class="chapter-num">6</div><div><p class="eyebrow">Read before relying on dates</p><h1>Assumptions</h1></div></div>
  <div class="grid-2">
    <div class="card"><h3>Capacity and calendar</h3>
      <ul class="dots tight">
        <li>One developer, 5 hours a day, Sunday to Thursday: 25 hours a week.</li>
        <li>Starts ${fmtLong(START_DATE)}. Tasks run one after another, in the order shown.</li>
        <li>Public holidays, leave and sick days are not included; add one day per day off.</li>
        <li>Each phase ends with a testing and fixes buffer (about 12%).</li>
      </ul></div>
    <div class="card"><h3>Estimates</h3>
      <ul class="dots tight">
        <li>Hours assume the developer works with AI coding tools, as today.</li>
        <li>Treat estimates as ±30%: larger items (ledger, bus tracking, CCTV) carry the most uncertainty.</li>
        <li>Outside providers (Paymob, SMS, WhatsApp, cameras) need accounts and approvals that can add waiting time.</li>
        <li>Phase 6 can be reordered or dropped without affecting phases 1–5.</li>
      </ul></div>
    <div class="card"><h3>What the statuses are based on</h3>
      <ul class="dots tight">
        <li>Code review of the whole project on 11 Oct 2026.</li>
        <li>Live read-only check of 401 pages as seven kinds of user on ${fmtY(REPORT_DATE)}.</li>
        <li>Production database compared with the code (12 updates waiting).</li>
      </ul></div>
    <div class="card"><h3>Keeping this document current</h3>
      <ul class="dots tight">
        <li>Statuses, tasks and hours live in <code>docs/pdf-source/build-feature-status.cjs</code>.</li>
        <li>Change a status or an estimate, run the script, then <code>build-pdfs.ps1 status</code>: dates and charts update themselves.</li>
      </ul></div>
  </div>
</section>`;

const css = `
  @page {
    size: A4;
    margin: 16mm 14mm 16mm 14mm;
    @bottom-left { content: "XO Platform  ·  Feature status & delivery plan  ·  ${fmtY(REPORT_DATE)}"; font-family: Inter, 'Segoe UI', sans-serif; font-size: 7.4pt; color: #8b91a3; }
    @bottom-right { content: "Page " counter(page); font-family: Inter, 'Segoe UI', sans-serif; font-size: 7.4pt; color: #8b91a3; }
  }
  @page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }

  :root { --ok: #006300; }
  .ok { color: var(--ok); font-weight: 600; }
  .r { text-align: right !important; }
  .c { text-align: center !important; }
  .nowrap { white-space: nowrap; }
  .chapter-head { margin-bottom: 10px; }
  .lead { margin-bottom: 10px; }
  .stats { margin: 8px 0 10px; }
  .stats .stat b { font-size: 17pt; }

  /* cover stats */
  .cover h1 { font-size: 34pt; }
  .cover .kind { margin-top: 48mm; }
  .cover-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 22px; max-width: 166mm; }
  .cover-stats div { padding: 12px 12px 10px; border-radius: 12px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.20); }
  .cover-stats b { display: block; font-size: 18pt; font-weight: 800; color: #fff; line-height: 1.15; letter-spacing: -0.01em; }
  .cover-stats span { font-size: 8pt; color: rgba(255,255,255,0.80); }

  /* status chips */
  .st { display: inline-flex; align-items: center; gap: 4px; padding: 1px 7px 1px 4px; border-radius: 999px; font-size: 7.3pt; font-weight: 600; color: var(--ink); border: 1px solid var(--line); background: #fff; white-space: nowrap; line-height: 1.5; }
  .st svg { width: 10px; height: 10px; flex: none; }
  .st.done { background: #eef8ee; border-color: #cfe9cf; }
  .st.partial { background: #fff7e4; border-color: #f4e1b0; }
  .st.fix { background: #fcecec; border-color: #f1cccc; }
  .st.todo { background: #f5f5f3; border-color: #e3e2dc; color: var(--ink-2); }
  th svg { width: 10px; height: 10px; vertical-align: -1px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 2px 0 8px; }

  /* stacked status bars: 2px surface gap between segments */
  .stack { display: flex; gap: 2px; height: 9px; width: 100%; min-width: 60px; }
  .stack span { flex-basis: 0; border-radius: 2px; }
  .stack span:first-child { border-top-left-radius: 4px; border-bottom-left-radius: 4px; }
  .stack span:last-child { border-top-right-radius: 4px; border-bottom-right-radius: 4px; }
  .stack .done { background: ${STATUS.done.color}; }
  .stack .partial { background: ${STATUS.partial.color}; }
  .stack .fix { background: ${STATUS.fix.color}; }
  .stack .todo { background: ${STATUS.todo.color}; }
  .stack.thin { height: 7px; width: 34mm; }

  table.summary td { padding: 4.5px 8px; vertical-align: middle; }
  table.summary td.num { color: var(--muted); font-weight: 700; width: 18px; }
  table.summary td.bar { width: 62mm; }
  table.summary tfoot td { border-top: 1px solid var(--line); background: var(--brand-soft-2); padding: 6px 8px; }
  table.t tfoot td { padding: 6px 10px; border-top: 1px solid var(--line); background: var(--brand-soft-2); }

  /* three-part picture */
  .tri .card h3 { font-size: 10.4pt; margin-bottom: 6px; }
  .good-card { border-top: 3px solid ${STATUS.done.color}; }
  .fix-card { border-top: 3px solid ${STATUS.fix.color}; }
  .todo-card { border-top: 3px solid #8a8f9c; }
  table.defs td { vertical-align: middle; }

  /* gantt */
  .gantt { border: 1px solid var(--line); border-radius: 12px; padding: 6px 12px 4px; margin: 4px 0 6px; break-inside: avoid; }
  .lane { display: grid; grid-template-columns: 44mm 1fr 34mm; align-items: center; gap: 10px; min-height: 30px; }
  .lane + .lane { border-top: 1px solid var(--line-2); }
  .lane.head, .lane.foot { border-top: 0; min-height: 0; }
  .lane.head { padding-bottom: 2px; border-bottom: 1px solid var(--line); }
  .lane.foot { height: 16px; }
  .lane-label { font-size: 8.6pt; color: var(--ink); display: flex; align-items: center; gap: 6px; }
  .lane-label b { color: var(--ink-2); font-size: 7.8pt; }
  .lane-dates { font-size: 7.8pt; color: var(--ink-2); line-height: 1.35; }
  .lane-track { position: relative; height: 30px; }
  .lane.head .lane-track { height: 30px; }
  .lane.foot .lane-track { height: 16px; }
  .sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; flex: none; vertical-align: -1px; margin-right: 5px; }
  .sw.lg { width: 12px; height: 34px; border-radius: 4px; margin-right: 10px; }
  .pbar { position: absolute; top: 10px; height: 10px; border-radius: 4px; }
  .ms { position: absolute; top: 10px; width: 8px; height: 8px; margin-left: -4px; background: #fff; border: 2px solid var(--brand-dark); transform: rotate(45deg); box-sizing: border-box; border-radius: 1px; }
  .wgrid { position: absolute; inset: 0; }
  .wgrid i { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid #ecebe6; }
  .wgrid.faint i { border-left-color: #f0efea; }
  .axis { position: absolute; inset: 0; }
  .axis .months span, .axis .weeks span { position: absolute; white-space: nowrap; overflow: hidden; }
  .axis .months span { top: 0; font-size: 7.8pt; font-weight: 700; color: var(--ink); border-left: 1px solid var(--line); padding-left: 3px; }
  .axis .weeks span { top: 15px; font-size: 6.6pt; color: var(--muted); text-align: center; }
  .today { position: absolute; top: -2px; bottom: -2px; width: 0; border-left: 1.5px solid var(--ink); }
  .today.big { top: -186px; bottom: 2px; }
  .today em { position: absolute; bottom: 0; left: 4px; font-style: normal; font-size: 7pt; font-weight: 700; color: var(--ink); white-space: nowrap; }
  table.phases td { vertical-align: middle; }

  /* module cards */
  /* A long module may continue on the next page: each piece keeps its own border and the
     table header repeats; the module header always stays with its first rows. */
  .mod { border: 1px solid var(--line); border-radius: 12px; margin: 0 0 10px; break-inside: avoid; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .mod-head { display: grid; grid-template-columns: 30px 1fr 64mm; gap: 10px; align-items: center; padding: 9px 12px; background: linear-gradient(90deg, var(--brand-soft), #fff 85%); border-bottom: 1px solid var(--line); border-radius: 12px 12px 0 0; break-after: avoid; break-inside: avoid; }
  .mod.long { break-inside: auto; }
  table.ftable thead { display: table-header-group; }
  .mod-head .mnum { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--brand); color: #fff; font-weight: 800; font-size: 9pt; }
  .mod-head h3 { margin: 0 0 3px; font-size: 11pt; }
  .mmeta { display: flex; align-items: center; gap: 8px; font-size: 7.8pt; color: var(--ink-2); }
  .mside { font-size: 7.8pt; }
  .mwin { margin-bottom: 4px; color: var(--ink-2); }
  .strip { position: relative; height: 10px; background: #fafaf8; border: 1px solid var(--line-2); border-radius: 4px; overflow: hidden; }
  .strip > span { position: absolute; top: 2px; height: 4px; border-radius: 2px; }
  .strip .today { top: 0; bottom: 0; border-left-width: 1px; }
  .strip.zoom { height: 12px; }
  .strip.zoom > span { top: 3px; height: 4px; }
  .strip.zoom .wgrid i { border-left-color: #ebeae4; }
  table.ftable { width: 100%; border-collapse: collapse; font-size: 8.3pt; }
  table.ftable th { text-align: left; font-size: 6.9pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); padding: 5px 12px 3px; }
  table.ftable td { padding: 4px 12px; border-top: 1px solid var(--line-2); vertical-align: middle; color: var(--ink); }
  table.ftable tr { break-inside: avoid; }
  table.ftable td.fname { width: 58%; }
  table.ftable td.fst { width: 17%; }
  table.ftable td.ftask { width: 10%; }
  table.ftable td.fdate { width: 15%; white-space: nowrap; color: var(--ink-2); }
  .note { display: block; font-size: 7.4pt; color: var(--muted); margin-top: 1px; }
  .tid { display: inline-flex; align-items: center; gap: 4px; font-size: 7.4pt; font-weight: 700; color: var(--ink-2); white-space: nowrap; }
  .tid::before { content: ''; width: 7px; height: 7px; border-radius: 2px; background: var(--c); }

  /* schedule */
  .sched { margin: 0 0 12px; }
  .sched-head { display: flex; align-items: center; margin: 8px 0 2px; break-after: avoid; }
  .sched-head h3 { margin: 0; font-size: 11pt; }
  .sched-head p { margin: 1px 0 0; font-size: 8.2pt; color: var(--muted); }
  table.stable td { vertical-align: middle; }
  table.stable td.k { width: 30px; }
  table.stable .tl { width: 46mm; }
  .feeds { display: block; font-size: 7.2pt; color: var(--muted); margin-top: 1px; }
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>XO Platform — Feature Status &amp; Delivery Plan</title>
<link rel="stylesheet" href="theme.css" />
<style>${css}</style>
</head>
<body>
${cover}
${glance}
${highlights}
${timeline}
${catalogue}
${schedule}
${assumptions}
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'feature-status.html'), html, 'utf8');
console.log(
  `feature-status.html written: ${totals.all} features (${totals.done} complete, ${totals.partial} partly done, ${totals.fix} needs fix, ${totals.todo} not started), ` +
  `overall ${pct(OVERALL)}; ${tasks.length} tasks, ${TOTAL_HOURS} h, ${WEEKS} weeks; ` +
  `phase ends: ${PHASES.map((p) => `${p.id} ${fmtY(p.end)}`).join(', ')}`,
);
