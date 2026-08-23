# Staff & Child Onboarding — Manual Test Checklist

Structured guide for **manual** QA. Aligns with the current React wizards (`StaffOnboardingWizard`, `ChildEnrollmentWizard`), Zod validation, and Edge Functions `staff-onboarding-complete` and `child-enrollment-complete`.

**Phone format (shared):** `+` followed by 8–15 digits (E.164-style), **or** `0` followed by 8–15 national digits (local; stored as `+20…` for Egypt). Invalid: missing `+`/`0`, wrong length, letters in number.

---

## 1. Staff Onboarding Tests (8 steps)

Wizard route: `/admin/staff/onboarding`. Step indices in code are **0–7**; UI titles use `staffOnboarding.steps.0` … `staffOnboarding.steps.7`.

### Step 0 — User account (`steps.0`: “User account”)

| Area | Details |
|------|---------|
| **Required (new user)** | At least one legal name per nursery language: Arabic if pref `ar`/`both`, English if `en`/`both`. **Mobile** required; international format. |
| **Required (existing user)** | **Parent user** selected from dropdown (`existingUserId`). |
| **Validation** | `validateStaffStep1` + `staffOnboardingFullSchema` (new user). Mobile: `isValidInternationalMobile`. |
| **Expected** | Next blocked with field errors + step toast if invalid. New user: Edge Function `staff-onboarding-complete` runs only on **final submit** (not on step Next). |

**Edge cases**

- New user: empty Arabic name when nursery requires AR.
- New user: empty mobile; mobile `12345`; mobile without `+` or `0`.
- Existing: no parent selected.
- Draft: localStorage key `xo-staff-onboarding-draft-v1` — refresh mid-flow, confirm draft restore.

---

### Step 1 — Position & contract (`steps.1`)

| Area | Details |
|------|---------|
| **Required** | `position`, `startDate`. |
| **Conditional** | If `employmentType` is **temporary** or **contract**: `contractEndDate` **required**; must be **after** `startDate` (string compare on `YYYY-MM-DD`). `contractAutoRenewal` optional checkbox. |
| **Validation** | `validateStaffStepPosition`; full schema `contractEndRequired` / `contractEndAfterStart`. |
| **Expected** | Probation hint only for `full_time` / `part_time` when `startDate` set. Contract block visible for temporary/contract. |

**Edge cases**

- Temporary + empty contract end → **Next** blocked.
- Contract end **same as or before** start date.
- Switch employment type from temporary → full_time: contract fields hidden; submit still validated only if type is temporary/contract again.

---

### Step 2 — Compensation (`steps.2`)

| Area | Details |
|------|---------|
| **Required** | `baseSalary` numeric **> 0** (step gate + full schema). |
| **Conditional** | If `paymentMethod` = **bank_transfer**: `bankName`, `bankAccountNumber` required on final submit. |
| **Validation** | Step: `Number(baseSalary) > 0`. Schema: salary + bank fields. |
| **Expected** | Gross + employer cost display updates. |

**Edge cases**

- `0`, negative, non-numeric salary.
- Bank transfer with empty bank name/account on final submit.

---

### Step 3 — Work schedule (`steps.3`)

| Area | Details |
|------|---------|
| **Required** | At least one **working day**; `workStartTime`, `workEndTime` non-empty. |
| **Validation** | `workingDays.length > 0` and times present. |
| **Expected** | Weekly hours summary shown. |

**Edge cases**

- Uncheck all weekdays → **Next** blocked.

---

### Step 4 — Personal information (`steps.4`)

| Area | Details |
|------|---------|
| **Required** | `nationalId`: exactly **14 digits** (after stripping spaces). `socialInsuranceNumber` non-empty (step gate). |
| **Validation** | `nationalId14` regex; `validateStaffStep` step 5. |
| **Expected** | Other fields optional for step navigation; full schema enforces national ID on submit. |

**Edge cases**

- National ID 13 or 15 digits; letters mixed in.

---

### Step 5 — Background & compliance (`steps.5`)

| Area | Details |
|------|---------|
| **Required** | None enforced for **Next** only (`validateStaffStep` returns `true`). |
| **Final submit** | Full `staffOnboardingFullSchema` still runs (national ID, salary, bank, emergency, terms, etc.). |

**Edge cases**

- Leave references empty — should still pass **Next**; final submit may still fail on other global rules.

---

### Step 6 — Emergency contact (`steps.6`)

| Area | Details |
|------|---------|
| **Required** | `emergencyName`, `emergencyPhone` non-empty; **emergency phone** must pass international validation. |
| **Validation** | `validateStaffStep` step 7; schema: `emergency` + `mobileInvalid` on phone. |
| **Expected** | Stored normalized: `normalizeInternationalMobile` on submit. |

**Edge cases**

- Empty emergency phone; invalid phone format.

---

### Step 7 — Review & submit (`steps.7`)

| Area | Details |
|------|---------|
| **Required** | `termsAccepted` **true**. |
| **Validation** | `validateStaffStep` step 8; schema `terms`. |
| **Expected** | Submit calls `submitStaffOnboarding`: `staff-onboarding-complete` (if new user), `users` update, `staff_profiles` insert, `staff_schedules` rows. Toast success; redirect `/admin/staff`. |

**Edge cases**

- Submit without checking terms — **Next** on last step is not used; submit is the button — schema must fail.

---

### Staff — Cross-flow edge cases

| Scenario | Expected |
|----------|----------|
| **New user** | Auth user created; `public.users` row `role` = `teacher`, `phone` matches normalized mobile. |
| **Existing parent** | No `staff-onboarding-complete`; `users` row promoted to `teacher` (`role = teacher` for that user id). |
| **Schedule partial failure** | Toast `schedulePartialFail` if some `staff_schedules` inserts fail. |

---

## 2. Child Enrollment Tests (7 steps)

Route: `/admin/children/enroll`. Steps **0–6** in code.

### Step 0 — Child basics (`steps.0`)

| Area | Details |
|------|---------|
| **Required** | `fullNameAr`; `fullNameEn` if nursery `en` or `both`. `dob`, `birthCertNumber`. Birth certificate **file** required before submit. |
| **Validation** | Age **3–72 months** from `dob`. |
| **Expected** | Next blocked if missing/invalid. |

**Edge cases**

- Child too young (&lt; 3 months) or too old (&gt; 72 months).
- Missing EN name when English required.
- Submit without birth certificate file → **submit** error `birthCertificateFileRequired`.

---

### Step 1 — Medical & safety (`steps.1`)

| Area | Details |
|------|---------|
| **Required** | If `hasAllergies` → at least one allergy row. Same for conditions, medications. |
| **Validation** | `validateChildStep` step 2; schema `addOne` for empty arrays when toggles on. |

**Edge cases**

- Toggle allergies on but delete all rows — **Next** blocked.

---

### Step 2 — Family information (`steps.2`)

| Area | Details |
|------|---------|
| **Required** | At least **one** valid parent mobile (father **or** mother): `isValidInternationalMobile`. Third-party **emergency** contact: name + **valid** mobile. |
| **Validation** | Parent mobile rules; `childEnrollment.validation.parentMobile` when both parents empty or both invalid. |

**Edge cases**

- Both mobiles empty.
- One invalid format (should show `mobileInvalid` on that field).
- Father valid, mother empty — **OK**.

---

### Step 3 — Authorized pickup (`steps.3`)

| Area | Details |
|------|---------|
| **Required** | For each **extra** pickup row with `fullName` filled: **14-digit** national ID, **valid** international mobile. |
| **Validation** | Parent mobiles already in schema; step 4 checks extra rows. |

**Edge cases**

- Extra row: name filled, wrong national ID length, wrong mobile.
- Skip rows with empty name — ignored.

---

### Step 4 — Developmental & social (`steps.4`)

| Area | Details |
|------|---------|
| **Required** | None hard-blocked for **Next** (returns `true`). |

---

### Step 5 — Legal & custody (`steps.5`)

| Area | Details |
|------|---------|
| **Required** | If `custodyStatus` = **court_order**, **court order file** required before submit. |
| **Validation** | Submit throws `courtOrderFileRequired` if missing. |

---

### Step 6 — Consents & vaccinations (`steps.6`)

| Area | Details |
|------|---------|
| **Required** | At least **one** consent checkbox true. `signatureName`, `signatureDate`. |
| **Validation** | `validateChildStep` step 7; schema `oneConsent`. |

**Edge cases**

- No consent checked.
- Empty signature name or date.

---

### Child — Cross-flow edge cases

| Scenario | Expected |
|----------|----------|
| **Photo consents** | If any photo consent true → `photo_privacy_restricted` false on child; else restricted. |
| **Submit** | `child-enrollment-complete` with `father`/`mother` payloads when mobiles present; pickups deduped by normalized phone. |

---

## 3. Database Verification Queries

Run in **Supabase SQL Editor** (or `psql`). Replace placeholders: `:nursery_id`, `:user_id`, `:child_id`, `:employee_id`, `:phone`.

### 3.1 After staff onboarding

**Note:** There is **no** `role_changes` table in the current XO schema. Verify **role** on `public.users` instead. If you add an audit table later, extend this section.

```sql
-- New staff user (teacher) after onboarding
SELECT id, nursery_id, role, name_ar, name_en, phone, email, status
FROM public.users
WHERE id = :user_id;

-- Staff profile
SELECT id, user_id, nursery_id, employee_id, department, position, hire_date,
       contract_type, salary_amount, emergency_contact_phone, national_id,
       hr_extended_json
FROM public.staff_profiles
WHERE nursery_id = :nursery_id
  AND employee_id = :employee_id;

-- Work schedule rows
SELECT staff_id, day_of_week, start_time, end_time, is_working_day
FROM public.staff_schedules
WHERE staff_id = (SELECT id FROM public.staff_profiles WHERE employee_id = :employee_id AND nursery_id = :nursery_id);

-- Promoted from parent: role should be teacher
SELECT role FROM public.users WHERE id = :user_id;
```

### 3.2 After child enrollment

```sql
-- Child row + JSON snapshot (medical/family live here; see 3.3)
SELECT id, nursery_id, full_name_ar, full_name_en, dob, status,
       avatar_url, photo_privacy_restricted, enrollment_extended_json
FROM public.children
WHERE id = :child_id;

-- Parent links
SELECT pc.*, u.phone, u.name_ar
FROM public.parent_children pc
JOIN public.users u ON u.id = pc.parent_id
WHERE pc.child_id = :child_id;

-- Authorized pickups
SELECT id, child_id, name, phone, relation, photo_url, active
FROM public.authorized_pickups
WHERE child_id = :child_id;

-- Parents created/updated (match normalized phone)
SELECT id, role, phone, name_ar
FROM public.users
WHERE nursery_id = :nursery_id
  AND phone IN (:father_phone_e164, :mother_phone_e164);
```

### 3.3 `health_records` vs enrollment JSON

The **`child-enrollment-complete`** Edge Function **does not insert** into `public.health_records`. Medical and vaccination data are stored in **`children.enrollment_extended_json`** (and file paths inside that JSON).

Optional checks:

```sql
-- Inspect medical snapshot (JSON)
SELECT enrollment_extended_json->'medical' AS medical,
       enrollment_extended_json->'vaccinations' AS vaccinations
FROM public.children
WHERE id = :child_id;
```

If you later add a **sync job** that writes `health_records` from enrollment, add verification queries there.

---

## 4. Edge Function Test Payloads

Invoke with **`Authorization: Bearer <user JWT>`** for a `branch_admin` / `chain_super_admin` / `xo_super_admin` whose `nursery_id` matches `nursery_id` (branch admins must match).

**Base URL:** `https://<project-ref>.supabase.co/functions/v1/<function-name>`

---

### 4.1 `staff-onboarding-complete`

**Valid body (new user):**

```json
{
  "nursery_id": "00000000-0000-0000-0000-000000000001",
  "name_ar": "موظف تجريبي",
  "name_en": "Test Staff",
  "mobile": "+201012345678",
  "email": null
}
```

**Expected success (200):** `{ "user_id": "<uuid>", "email": "...", "temp_password": "..." }`

**Invalid bodies (examples):**

| Body | Expected |
|------|----------|
| `{}` or missing `nursery_id` / empty `name_ar` / empty `mobile` | **400** `{ "error": "Missing required fields" }` |
| No `Authorization` header | **401** `{ "error": "Unauthorized" }` |
| `branch_admin` with `nursery_id` ≠ caller’s nursery | **403** `{ "error": "Forbidden" }` |
| Parent role caller | **403** |

---

### 4.2 `child-enrollment-complete`

**Valid body (minimal shape):**

```json
{
  "nursery_id": "00000000-0000-0000-0000-000000000001",
  "child": {
    "full_name_ar": "طفل تجريبي",
    "full_name_en": "Test Child",
    "dob": "2022-01-15",
    "gender": "female",
    "nationality": "EG",
    "birth_certificate_number": "BC-123",
    "avatar_url": null,
    "photo_privacy_restricted": false
  },
  "enrollment_extended_json": { "wizardVersion": 1 },
  "father": null,
  "mother": null,
  "pickups": []
}
```

**Expected success (200):** `{ "child_id": "<uuid>" }`

**Invalid bodies (examples):**

| Body | Expected |
|------|----------|
| Missing `nursery_id`, or `child.full_name_ar` empty, or `child.dob` missing | **400** `{ "error": "Missing required fields" }` |
| No `Authorization` | **401** |
| Wrong nursery for branch admin | **403** |
| Insert failure (e.g. FK) | **500** `{ "error": "<message>" }` |

**Parent with invalid mobile** (cannot normalize): `father` / `mother` with bad `mobile` → `ensureParentUser` returns `null` — child may still insert; **no** parent link for that side.

---

## 5. Quick regression matrix

| Check | Staff | Child |
|-------|-------|-------|
| RTL + Arabic labels | ✓ | ✓ |
| Mobile `+` / `0` formats | ✓ | ✓ |
| Final submit blocked by Zod | ✓ | ✓ |
| File upload required | — | Birth cert; court order if `court_order` |
| Redirect after success | `/admin/staff` | `/admin/children` |

---

*Generated for the XO Nursery Platform codebase. Update this file when schema or validation rules change.*
