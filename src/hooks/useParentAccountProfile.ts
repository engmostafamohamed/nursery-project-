import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { UserRow } from '@/types/user';

export type ParentContactProfile = {
  fullName: string;
  job: string;
  mobile: string;
  email: string;
  nationalId: string;
  idPhotoPath: string;
};

export type ParentFamilyProfile = {
  address: string;
  maritalStatus: string;
  emergencyContact: string;
};

export type ParentApplicationProfileRow = {
  id: string;
  status: string;
  parentInfo: Record<string, unknown>;
};

type ChildParentProfileRow = {
  id: string;
  enrollment_extended_json: Record<string, unknown> | null;
};

export type ParentAccountProfile = {
  father: ParentContactProfile;
  mother: ParentContactProfile;
  family: ParentFamilyProfile;
  sourceApplicationId: string | null;
  applications: ParentApplicationProfileRow[];
};

const emptyContact: ParentContactProfile = {
  fullName: '',
  job: '',
  mobile: '',
  email: '',
  nationalId: '',
  idPhotoPath: '',
};

const emptyFamily: ParentFamilyProfile = {
  address: '',
  maritalStatus: '',
  emergencyContact: '',
};

function readObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readFirstString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readString(source, key);
    if (value) return value;
  }
  return '';
}

function isPlaceholderParentName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes('registration cycle parent') ||
    normalized.includes('@parents.xo.local') ||
    normalized.includes('@parent.placeholder.xo')
  );
}

function firstRealName(...values: string[]): string {
  return values.find((value) => !isPlaceholderParentName(value)) ?? '';
}

function mergePreferredContact(base: ParentContactProfile, preferred: ParentContactProfile): ParentContactProfile {
  return {
    fullName: firstRealName(preferred.fullName, base.fullName),
    job: preferred.job || base.job,
    mobile: preferred.mobile || base.mobile,
    email: preferred.email || base.email,
    nationalId: preferred.nationalId || base.nationalId,
    idPhotoPath: preferred.idPhotoPath || base.idPhotoPath,
  };
}

function contactFromJson(source: Record<string, unknown>, key: 'father' | 'mother'): ParentContactProfile {
  const contact = readObject(source, key);
  const prefix = key === 'father' ? 'father' : 'mother';
  return {
    fullName: readFirstString(contact, ['full_name', 'name']) || readFirstString(source, [`${prefix}_full_name`, `${prefix}FullName`]),
    job: readFirstString(contact, ['job', 'occupation']) || readFirstString(source, [`${prefix}_job`, `${prefix}Job`]),
    mobile: readFirstString(contact, ['mobile', 'phone', 'mobile_phone']) || readFirstString(source, [`${prefix}_mobile`, `${prefix}Mobile`, `${prefix}_phone`]),
    email: readString(contact, 'email') || readFirstString(source, [`${prefix}_email`, `${prefix}Email`]),
    nationalId: readString(contact, 'national_id') || readFirstString(source, [`${prefix}_national_id`, `${prefix}NationalId`]),
    idPhotoPath: readString(contact, 'id_photo_path') || readFirstString(source, [`${prefix}_id_photo_path`, `${prefix}IdPhotoPath`]),
  };
}

function familyFromJson(source: Record<string, unknown>): ParentFamilyProfile {
  const family = readObject(source, 'family');
  return {
    address: readString(family, 'address') || readString(source, 'address'),
    maritalStatus: readString(family, 'marital_status') || readString(source, 'marital_status'),
    emergencyContact: readString(family, 'emergency_contact') || readString(source, 'emergency_contact'),
  };
}

export function parentDisplayNameFromProfile(
  profile: UserRow | null | undefined,
  account: ParentAccountProfile | null | undefined,
  language: string,
): string {
  const fatherName = firstRealName(account?.father.fullName.trim() ?? '');
  if (fatherName) return fatherName;

  const ar = profile?.name_ar?.trim() ?? '';
  const en = profile?.name_en?.trim() ?? '';
  const localized = language.startsWith('ar') ? firstRealName(ar, en) : firstRealName(en, ar);
  return localized || profile?.email || '-';
}

export function useParentAccountProfile(parentId: string | undefined, nurseryId?: string | null) {
  return useQuery({
    queryKey: ['parent-account-profile', parentId, nurseryId ?? ''],
    queryFn: async (): Promise<ParentAccountProfile> => {
      if (!parentId) {
        return {
          father: emptyContact,
          mother: emptyContact,
          family: emptyFamily,
          sourceApplicationId: null,
          applications: [],
        };
      }

      let query = supabase
        .from('applications')
        .select('id, status, parent_info_json, updated_at')
        .eq('parent_id', parentId)
        .order('updated_at', { ascending: false });

      if (nurseryId) query = query.eq('nursery_id', nurseryId);

      const { data, error } = await query;
      if (error) throw error;

      const applications = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        status: String(row.status ?? ''),
        parentInfo: (row.parent_info_json as Record<string, unknown> | null) ?? {},
      }));
      const source = applications.find((row) => Object.keys(row.parentInfo).length > 0) ?? null;
      const sourceInfo = source?.parentInfo ?? {};
      let father = { ...emptyContact };
      let mother = { ...emptyContact };
      let family = { ...emptyFamily };

      for (const row of [...applications].reverse()) {
        const info = row.parentInfo;
        if (Object.keys(info).length === 0) continue;
        father = mergePreferredContact(father, contactFromJson(info, 'father'));
        mother = mergePreferredContact(mother, contactFromJson(info, 'mother'));

        const applicationFamily = familyFromJson(info);
        family = {
          address: applicationFamily.address || family.address,
          maritalStatus: applicationFamily.maritalStatus || family.maritalStatus,
          emergencyContact: applicationFamily.emergencyContact || family.emergencyContact,
        };
      }

      const linkRes = await supabase
        .from('parent_children')
        .select('child:children(id, enrollment_extended_json)')
        .eq('parent_id', parentId);
      if (linkRes.error) throw linkRes.error;

      for (const row of (linkRes.data ?? []) as Array<{ child?: ChildParentProfileRow | ChildParentProfileRow[] | null }>) {
        const child = Array.isArray(row.child) ? row.child[0] : row.child;
        const extended = child?.enrollment_extended_json ?? {};
        const parents = readObject(extended, 'parents');
        const childFather = contactFromJson(parents, 'father');
        const childMother = contactFromJson(parents, 'mother');
        father = mergePreferredContact(father, childFather);
        mother = mergePreferredContact(mother, childMother);

        const childFamily = readObject(extended, 'family');
        family = {
          address: readString(childFamily, 'address') || family.address,
          maritalStatus: readString(childFamily, 'marital_status') || family.maritalStatus,
          emergencyContact: readString(childFamily, 'emergency_contact') || family.emergencyContact,
        };
      }

      const legacyFullName = readString(sourceInfo, 'full_name');
      if (!father.fullName && !isPlaceholderParentName(legacyFullName)) father.fullName = legacyFullName;
      if (!father.mobile) father.mobile = readString(sourceInfo, 'phone');
      if (!father.email) father.email = readString(sourceInfo, 'email');
      if (!father.nationalId) father.nationalId = readString(sourceInfo, 'national_id');
      if (isPlaceholderParentName(father.fullName)) father.fullName = '';
      if (isPlaceholderParentName(mother.fullName)) mother.fullName = '';

      return {
        father,
        mother,
        family,
        sourceApplicationId: source?.id ?? null,
        applications,
      };
    },
    enabled: Boolean(parentId),
    staleTime: 1000 * 60,
  });
}
