import type { ChildAllergiesRow, ChildHealthRecordsRow, ChildMedicationsRow, ChildVaccinationsRow } from '@/types/tables/child_health';

export type HealthAlertType =
  | 'medication_expired'
  | 'vaccination_overdue'
  | 'severe_allergy'
  | 'life_threatening_allergy'
  | 'missing_emergency'
  | 'missing_pediatrician';

export type HealthUrgency = 'critical' | 'high' | 'medium' | 'low';

export type HealthAlertItem = {
  fingerprint: string;
  type: HealthAlertType;
  urgency: HealthUrgency;
  childId: string;
  childNameAr: string;
  childNameEn: string;
  classId: string | null;
  classNameAr: string;
  classNameEn: string;
  detailAr: string;
  detailEn: string;
};

export function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isBlank(v: string | null | undefined): boolean {
  return !v || v.trim().length === 0;
}

type ChildLite = {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  class_id: string | null;
};

type ClassLite = { id: string; name_ar: string; name_en: string };

type Input = {
  today: string;
  children: ChildLite[];
  classesById: Map<string, ClassLite>;
  recordsByChildId: Map<string, ChildHealthRecordsRow>;
  medications: ChildMedicationsRow[];
  vaccinations: ChildVaccinationsRow[];
  allergies: ChildAllergiesRow[];
  dismissedFingerprints: Set<string>;
};

export function computeHealthAlerts(input: Input): HealthAlertItem[] {
  const out: HealthAlertItem[] = [];
  const { today, children, classesById, recordsByChildId, medications, vaccinations, allergies, dismissedFingerprints } =
    input;

  const childMap = new Map(children.map((c) => [c.id, c]));

  const pushIfNew = (a: HealthAlertItem) => {
    if (!dismissedFingerprints.has(a.fingerprint)) out.push(a);
  };

  for (const m of medications) {
    if (!m.expiry_date) continue;
    if (m.expiry_date >= today) continue;
    const child = childMap.get(m.child_id);
    if (!child) continue;
    const cl = child.class_id ? classesById.get(child.class_id) : undefined;
    pushIfNew({
      fingerprint: `med_expired:${m.id}`,
      type: 'medication_expired',
      urgency: 'high',
      childId: child.id,
      childNameAr: child.full_name_ar,
      childNameEn: child.full_name_en,
      classId: child.class_id,
      classNameAr: cl?.name_ar ?? '',
      classNameEn: cl?.name_en ?? '',
      detailAr: m.name,
      detailEn: m.name,
    });
  }

  for (const v of vaccinations) {
    if (!v.next_due_date) continue;
    if (v.next_due_date >= today) continue;
    const child = childMap.get(v.child_id);
    if (!child) continue;
    const cl = child.class_id ? classesById.get(child.class_id) : undefined;
    pushIfNew({
      fingerprint: `vac_overdue:${v.id}`,
      type: 'vaccination_overdue',
      urgency: 'high',
      childId: child.id,
      childNameAr: child.full_name_ar,
      childNameEn: child.full_name_en,
      classId: child.class_id,
      classNameAr: cl?.name_ar ?? '',
      classNameEn: cl?.name_en ?? '',
      detailAr: v.vaccine_name,
      detailEn: v.vaccine_name,
    });
  }

  for (const al of allergies) {
    if (al.severity === 'life_threatening') {
      const child = childMap.get(al.child_id);
      if (!child) continue;
      const cl = child.class_id ? classesById.get(child.class_id) : undefined;
      pushIfNew({
        fingerprint: `allergy_lt:${al.id}`,
        type: 'life_threatening_allergy',
        urgency: 'critical',
        childId: child.id,
        childNameAr: child.full_name_ar,
        childNameEn: child.full_name_en,
        classId: child.class_id,
        classNameAr: cl?.name_ar ?? '',
        classNameEn: cl?.name_en ?? '',
        detailAr: al.allergen_name,
        detailEn: al.allergen_name,
      });
    } else if (al.severity === 'severe') {
      const child = childMap.get(al.child_id);
      if (!child) continue;
      const cl = child.class_id ? classesById.get(child.class_id) : undefined;
      pushIfNew({
        fingerprint: `allergy_severe:${al.id}`,
        type: 'severe_allergy',
        urgency: 'high',
        childId: child.id,
        childNameAr: child.full_name_ar,
        childNameEn: child.full_name_en,
        classId: child.class_id,
        classNameAr: cl?.name_ar ?? '',
        classNameEn: cl?.name_en ?? '',
        detailAr: al.allergen_name,
        detailEn: al.allergen_name,
      });
    }
  }

  for (const child of children) {
    const rec = recordsByChildId.get(child.id);
    const missingEm =
      !rec ||
      (isBlank(rec.emergency_contact_name) && isBlank(rec.emergency_contact_phone));
    if (missingEm) {
      const cl = child.class_id ? classesById.get(child.class_id) : undefined;
      pushIfNew({
        fingerprint: `miss_emergency:${child.id}`,
        type: 'missing_emergency',
        urgency: 'medium',
        childId: child.id,
        childNameAr: child.full_name_ar,
        childNameEn: child.full_name_en,
        classId: child.class_id,
        classNameAr: cl?.name_ar ?? '',
        classNameEn: cl?.name_en ?? '',
        detailAr: '—',
        detailEn: '—',
      });
    }

    const missingPed = !rec || isBlank(rec.pediatrician_name);
    if (missingPed) {
      const cl = child.class_id ? classesById.get(child.class_id) : undefined;
      pushIfNew({
        fingerprint: `miss_pediatrician:${child.id}`,
        type: 'missing_pediatrician',
        urgency: 'medium',
        childId: child.id,
        childNameAr: child.full_name_ar,
        childNameEn: child.full_name_en,
        classId: child.class_id,
        classNameAr: cl?.name_ar ?? '',
        classNameEn: cl?.name_en ?? '',
        detailAr: '—',
        detailEn: '—',
      });
    }
  }

  const order: Record<HealthUrgency, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  out.sort((a, b) => order[a.urgency] - order[b.urgency] || a.childNameEn.localeCompare(b.childNameEn));
  return out;
}
