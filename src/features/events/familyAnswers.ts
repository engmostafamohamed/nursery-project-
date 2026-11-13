/*
 * A family's answers across events, for its dashboard: which events still wait for its answer
 * (the soonest deadline first), and where each event stands for the family.
 */

export type FamilyAnswerRow = {
  event_id: string;
  child_id: string;
  event_title_ar: string;
  event_title_en: string;
  event_category: string;
  starts_at: string;
  status: string;
  deadline: string | null;
};

/** Where an event stands for the family: a child still to answer, a child going, or none going. */
export type FamilyAnswer = 'needsAnswer' | 'going' | 'notGoing';

export function answersByEvent(rows: FamilyAnswerRow[]): Record<string, FamilyAnswer> {
  const out: Record<string, FamilyAnswer> = {};
  for (const row of rows) {
    const now: FamilyAnswer = row.status === 'pending' ? 'needsAnswer' : row.status === 'granted' ? 'going' : 'notGoing';
    const had = out[row.event_id];
    // A child still to answer comes first, then a child going.
    if (!had || now === 'needsAnswer' || (now === 'going' && had === 'notGoing')) out[row.event_id] = now;
  }
  return out;
}

export type AwaitingAnswer = {
  eventId: string;
  titleAr: string;
  titleEn: string;
  category: string;
  startsAt: string;
  deadline: string | null;
  childIds: string[];
};

/** The events still waiting for the family's answer that can still be answered, the soonest due first. */
export function awaitingAnswers(rows: FamilyAnswerRow[], now: Date = new Date()): AwaitingAnswer[] {
  const byEvent = new Map<string, AwaitingAnswer>();
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    if (new Date(row.starts_at).getTime() <= now.getTime()) continue;
    if (row.deadline && new Date(row.deadline).getTime() <= now.getTime()) continue;
    const item = byEvent.get(row.event_id) ?? {
      eventId: row.event_id,
      titleAr: row.event_title_ar,
      titleEn: row.event_title_en,
      category: row.event_category,
      startsAt: row.starts_at,
      deadline: row.deadline,
      childIds: [],
    };
    item.childIds.push(row.child_id);
    if (row.deadline && (!item.deadline || row.deadline < item.deadline)) item.deadline = row.deadline;
    byEvent.set(row.event_id, item);
  }
  const due = (a: AwaitingAnswer) => new Date(a.deadline ?? a.startsAt).getTime();
  return [...byEvent.values()].sort((a, b) => due(a) - due(b));
}
