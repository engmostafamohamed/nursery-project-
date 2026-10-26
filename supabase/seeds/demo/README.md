# Demo data (dev only)

A full, realistic data set for the **dev** project: the *Cherries Nurseries* chain with 20 branches and
**5,000 children**, their families, the staff of every role, and three months of nursery life.

```bash
npm run seed:demo-data -- --yes          # everything (deletes the current children and parents first)
npm run seed:demo-data -- --yes 15       # up to a file, without the reset: adds only what is missing
```

It needs `SUPABASE_DB_PASSWORD` in `.env` and the linked dev project (`npx supabase link`). It **refuses
any project but dev** (`hlhlpjecinkqqsqrjpcj`), and asks for `--yes` because the reset files delete data.
Every run gives the same data: names, amounts and ids come from fixed keys, not from chance.

## Files, in the order they run

| File | What it seeds |
|---|---|
| `00_helpers.sql` | The `seed` schema the others use: fixed "random" values, Egyptian names (Arabic and English), the 20 branches, the 10 classes of every branch, the demo password, hiring staff and removing what a reset replaces. Dropped by `99_finish.sql`. |
| **Reset** | |
| `01_reset_branches.sql` | Branch by branch: deletes its children (with all their records), its parents except `demo-parent` (with their invoices and payments), the seed's staff, and the branch itself when the seed made it. |
| `02_reset_leftovers.sql` | Children and parents outside the branches, the test nurseries (`ghnghn`, `rtyrty`, `test`, `ttest`), an earlier run's chain, and the main branch's test events, tuition packages, discounts and placeholder-named class, packages and course. |
| **The chain** | |
| `03_chain_and_branches.sql` | The chain, the main branch (Cherries) joining it, and 19 branches in Cairo, Giza, Alexandria and the governorates, with their hours and payment details. |
| **Staff, one file per role** | Each with an account, the role at the branch and an HR record (contract, salary, hours). |
| `04_branch_admins.sql` | A branch admin per branch (`admin.b<branch>`; branch 1: `demo-branch-admin`) and the chain admin. |
| `05_managers.sql` | A finance and an HR manager per branch (`finance.b<branch>`, `hr.b<branch>`; branch 1: `demo-manager`, `demo-manager-hr`). |
| `06_classes.sql` | 10 classes per branch, from Little Lambs (6–12 months) to Moons (5–6 years), 25 places each. |
| `07_teacher_managers.sql` | A head of teachers per branch (`head.b<branch>`), who manages the class teams. |
| `08_teachers.sql` | A lead teacher per class (`lead<class>.b<branch>`), who sends its daily reports. The main branch's classes keep their leads (`demo-teacher`, `demo-manager-teacher`). |
| `09_assistant_teachers.sql` | An assistant teacher per class (`asst<class>.b<branch>`). |
| **Families** | |
| `10_packages.sql` | Half day, full day and extended day tuition (monthly, quarterly, half-year and annual prices, by area), and extra-hours packs. |
| `11_parents.sql` | 200 families per branch: both parents' accounts (some mothers raising their children alone), with a job and a national id. `demo-parent` is the main branch's 4th family's mother. |
| `12_children.sql` | 250 children per branch (25 per class, brothers and sisters in the same branch) with a full profile, both parents linked, emergency contacts and who may pick the child up. |
| **Nursery life** | |
| `13_health.sql` | Allergies (about 1 child in 10), long-term conditions (asthma, eczema, favism…) and the inhalers kept at the nursery. |
| `14_subscriptions.sql` | Every child's tuition subscription (mostly monthly) and some extra-hours packs. |
| `15_attendance.sql` | The last 20 school days: check-in and pick-up times, a few late pick-ups, absences and most of them reported by the family. |
| `16_daily_reports.sql` | A sent daily report for every child who came on each of the last 10 school days, from the class's lead teacher. |
| `17_invoices_and_payments.sql` | Tuition invoices since August and their payments: paid, part-paid, waiting for confirmation, overdue. |
| `18_events.sql` | Six events per branch (past and coming) and the families' permission answers. |
| `19_courses.sql` | Four after-school courses per new branch and their enrolments. |
| `99_finish.sql` | Drops the helpers and refreshes the planner's statistics. |
| `counts.sql` | What the database holds afterwards (the runner prints it). |

Files marked `{{branches}}` run a few branches at a time (`SEED_DEMO_BATCH`, 4 by default): the database
stops any statement after two minutes, and each file runs as one statement (one transaction).

## Signing in

Every account uses the demo password **`Demo2026!`**.

| Who | Email |
|---|---|
| The demo accounts (main branch, Cherries) | `demo-branch-admin@xonursery.com`, `demo-manager@xonursery.com` (finance), `demo-manager-hr@xonursery.com`, `demo-teacher@xonursery.com` (leads Butterflies and Sunflowers), `demo-manager-teacher@xonursery.com` (leads Stars), `demo-parent@xonursery.com` (a child in Butterflies and one in Stars) |
| Chain admin | `chain.admin@staff.cherries.example` |
| Staff of branch *b* | `admin.b2@…`, `finance.b2@…`, `hr.b2@…`, `head.b2@…`, `lead4.b2@…` (lead teacher of the 4th class), `asst4.b2@…` — all `@staff.cherries.example` |
| Parents of family *f* at branch *b* | `mother.b2.f14@parents.cherries.example`, `father.b2.f14@parents.cherries.example` |

Branch 1 is the main branch (Cherries); its admin and managers are the demo accounts. The
`.example` addresses can't receive mail, and the app's messages stay in demo mode on dev.

## Adding to it

Put a new feature's data in its own numbered file, keep it re-runnable (stable ids from `seed.uid`,
`on conflict do nothing`), and add what it seeds to `counts.sql`. Never point the runner at production.
