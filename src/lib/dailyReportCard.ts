// A daily report as the family receives it: the child (name, photo, code, class of that day), the
// day, who sent it, and the answers. Built from get_parent_daily_reports and get_daily_report rows
// (the same column names), or from the editor's answers for a preview.
import { fromRow, type DailyReportAnswers } from './dailyReport';
import type { ClassPlace, SenderFields, StaffDepartment, StaffRole } from './familyMessages';

export type DailyReportCard = {
  /** Null for a preview of a report not saved yet. */
  id: string | null;
  childId: string;
  childNameAr: string | null;
  childNameEn: string | null;
  avatarUrl: string | null;
  childCode: string | null;
  classNameAr: string | null;
  classNameEn: string | null;
  reportDate: string;
  publishedAt: string | null;
  /** Null when nobody is known to have sent it (a report from before senders were kept). */
  sender: SenderFields | null;
  answers: DailyReportAnswers;
};

type Row = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** The sender kept on a report row; their classes are the report's class. */
export function senderOfRow(row: Row): SenderFields | null {
  const role = text(row.sender_role);
  if (!role) return null;
  return {
    sender_name_ar: text(row.sender_name_ar),
    sender_name_en: text(row.sender_name_en),
    sender_role: role as StaffRole,
    sender_role_title_ar: text(row.sender_role_title_ar),
    sender_role_title_en: text(row.sender_role_title_en),
    sender_department: text(row.sender_department) as StaffDepartment | null,
    sender_class_names_ar: text(row.class_name_ar),
    sender_class_names_en: text(row.class_name_en),
    sender_class_role: text(row.sender_class_role) as ClassPlace | null,
  };
}

export function cardFromRow(row: Row): DailyReportCard {
  return {
    id: text(row.report_id) ?? text(row.id),
    childId: String(row.child_id ?? ''),
    childNameAr: text(row.full_name_ar),
    childNameEn: text(row.full_name_en),
    avatarUrl: text(row.avatar_url),
    childCode: text(row.child_code),
    classNameAr: text(row.class_name_ar),
    classNameEn: text(row.class_name_en),
    reportDate: String(row.report_date ?? ''),
    publishedAt: text(row.published_at),
    sender: senderOfRow(row),
    answers: fromRow(row),
  };
}

const pick = (ar: string | null, en: string | null, lang: string) => (lang.startsWith('ar') ? ar || en : en || ar) || '';

export const childNameOf = (card: Pick<DailyReportCard, 'childNameAr' | 'childNameEn'>, lang: string) => pick(card.childNameAr, card.childNameEn, lang);
export const classNameOf = (card: Pick<DailyReportCard, 'classNameAr' | 'classNameEn'>, lang: string) => pick(card.classNameAr, card.classNameEn, lang);
