export const MEDICATION_CONSENT_IDS = [
  'cetal',
  'panadol',
  'brufen',
  'antinal',
  'motilium',
  'viseralgine',
  'hemoclar_reparil_gel',
  'mebo',
  'insect_bite_cream',
  'betadine',
] as const;

export type MedicationConsentId = (typeof MEDICATION_CONSENT_IDS)[number];

export type MedicationConsentOption = {
  id: MedicationConsentId;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
};

export const MEDICATION_CONSENT_OPTIONS: MedicationConsentOption[] = [
  {
    id: 'cetal',
    labelEn: 'Cetal',
    labelAr: 'سيتال',
    descriptionEn: 'Paracetamol — fever and mild pain relief',
    descriptionAr: 'باراسيتامول — لخفض الحرارة وتسكين الألم الخفيف',
  },
  {
    id: 'panadol',
    labelEn: 'Panadol',
    labelAr: 'Panadol',
    descriptionEn: 'Paracetamol - fever and mild pain relief',
    descriptionAr: 'Paracetamol - fever and mild pain relief',
  },
  {
    id: 'brufen',
    labelEn: 'Brufen',
    labelAr: 'بروفين',
    descriptionEn: 'Ibuprofen — fever and inflammation',
    descriptionAr: 'ايبوبروفين — لخفض الحرارة والالتهاب',
  },
  {
    id: 'antinal',
    labelEn: 'Antinal',
    labelAr: 'أنتينال',
    descriptionEn: 'Anti-diarrheal',
    descriptionAr: 'مضاد للإسهال',
  },
  {
    id: 'motilium',
    labelEn: 'Motilium',
    labelAr: 'موتيليوم',
    descriptionEn: 'Anti-nausea / vomiting',
    descriptionAr: 'مضاد للغثيان والقيء',
  },
  {
    id: 'viseralgine',
    labelEn: 'Viseralgine',
    labelAr: 'فيزيرالجين',
    descriptionEn: 'Stomach cramps and colic relief',
    descriptionAr: 'مسكن لتقلصات المعدة والمغص',
  },
  {
    id: 'hemoclar_reparil_gel',
    labelEn: 'Hemoclar / Reparil Gel',
    labelAr: 'هيموكلار / جل ريباريل',
    descriptionEn: 'Topical gel for bruises and swelling',
    descriptionAr: 'جل موضعي للكدمات والتورم',
  },
  {
    id: 'mebo',
    labelEn: 'Mebo',
    labelAr: 'ميبو',
    descriptionEn: 'Burn and wound healing ointment',
    descriptionAr: 'مرهم لعلاج الحروق والجروح',
  },
  {
    id: 'insect_bite_cream',
    labelEn: 'Insect Bite Cream',
    labelAr: 'كريم لدغات الحشرات',
    descriptionEn: 'Topical relief for insect stings and bites',
    descriptionAr: 'مرهم موضعي للدغات ولسعات الحشرات',
  },
  {
    id: 'betadine',
    labelEn: 'Betadine',
    labelAr: 'بيتادين',
    descriptionEn: 'Antiseptic for cuts and scrapes',
    descriptionAr: 'مطهر للجروح والخدوش',
  },
];

export function getMedicationLabel(id: MedicationConsentId, lang: 'en' | 'ar'): string {
  const opt = MEDICATION_CONSENT_OPTIONS.find((o) => o.id === id);
  if (!opt) return id;
  return lang === 'ar' ? opt.labelAr : opt.labelEn;
}
