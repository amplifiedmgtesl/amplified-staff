# Staff App — V2 Alignment Plan

The staff app (`amplified-staff`) shares the **same Supabase project** as the admin
app (`Amplified-AOS`, project `wmssllfmahotppoyxxrr`). The V2 normalization/FK work
in AOS changed the schema out from under the staff app. This plan re-aligns it.

## Decisions (confirmed 2026-06-14)
1. **Staff entries must be fully priced & approval-ready.** Admins should only need to
   *approve* — never fill in rates. We port AOS's hours/rate logic into the staff app.
2. **My Schedule shows ALL assignments** (no confirmed/upcoming filter).
3. **Keep the coordinator escape hatch** — log time with no job (`job_id` null); this is
   the one intentionally-incomplete path (admin fills rates), unchanged.
4. **Code sharing = copy-with-sync-header.** Pure calc + rate-resolver modules are copied
   verbatim into the staff app with a header naming the AOS source file as source-of-truth.

## Root breakage found
- Migration `20260528b` renamed `std_rate/ot_rate/dt_rate/total_pay` →
  `bill_std_rate/bill_ot_rate/bill_dt_rate/bill_total` on `timesheet_entries`.
  The staff app still writes the old names → **every timesheet submit/edit throws** (PGRST204).
- `job_sheets` / `job_sheet_workers` are decommissioned (read-only history, no longer
  populated). The V2 schedule model is `job_requests` + `job_request_days` +
  `job_request_shifts` + `job_request_assignments` (keyed by **`employee_key`**, not email).

## V2 model reference
- `job_requests` — the job (client, event_name, venue, city_state, dates, job_no, rate_card_profile_id)
- `job_request_days` — per day (event_date, call_time, start/end_time, is_holiday)
- `job_request_shifts` — named shifts within a job
- `job_request_assignments` — employee_key → job_request_day_id (+ shift_id, position_id, specialty_id, confirmed)
- A staff assignment already carries shift_id/position_id/specialty_id/event_date/is_holiday
  — exactly the fields that make an entry approvable.

## How AOS builds a complete entry (must replicate)
1. **Hours**: `computeTimeEntry()` (AOS `lib/store/timekeeping.ts:28-133`) — pure.
2. **Bill rates** (CORRECTED 2026-06-14): from the job's MOST RECENT QUOTE
   (`quotes.rate_card_profile_id`), NOT `job_requests.rate_card_profile_id`. Source of truth = AOS
   timekeeping screen (`components/shared/timekeeping.tsx` job-meta useEffect). Then
   `rate_card_profile_rows` matched by `specialty_id` → snapshot hourly/ot_rate/dt_rate/ot_after/
   dt_after. No quote / no profile / no specialty row → 35/52/70. NO client/effective-date fallback
   in this path (that fallback, `resolveRateCardForJob`/`pickRateCardForJob`, is the quote/invoice
   builder path and is NOT used by the staff app).
3. **Holiday**: `is_holiday` from `job_request_days`; `holiday_multiplier` from latest quote
   (fallback 2.0). Holiday total = total_hours × bill_std_rate × multiplier (no OT/DT stacking).
4. **Approvability**: specialty_id required if position has specialties; shift_id required if job
   has shifts — both come free from the assignment.

## Operational workflow (learned 2026-06-14 — drives Phase 1.x)
Crew leaders PRE-BUILD each day's worker list in AOS timekeeping → those create admin
"planned" entries: `status='submitted'`, `timesheet_id` SET (on the job sheet), `employee_key`
SET, `user_id` NULL. The day's sheet is printed as a physical sign-in sheet. Normally the worker
just needs to UPDATE their planned record with actual time — not create anything. Exceptions:
mid-shift reassignment, or an extra unscheduled shift → worker CREATES a new entry.

Decisions (2026-06-14):
- Editing a planned entry keeps `status='submitted'` (stays pending approval, stays on the sheet).
- After approval, entries are LOCKED to the worker (admin must unlock, or worker adds a new entry).
- Mid-shift reassignment = SPLIT: edit the planned entry for original-role hours, create a new
  entry for the reassigned role. (Mirrors AOS's distinct position/specialty bill rows.)

## Phase 1.x — planned-record workflow fixes (DONE 2026-06-14)
- [x] **Bug fix:** `updateStaffEntry` no longer nulls `timesheet_id`. `buildEntryRow` omits the
      column; `createStaffEntry` sets it null (exception entries → pending queue), `updateStaffEntry`
      omits it (existing value preserved → planned entry stays on the job sheet).
- [x] Edit stamps the worker's `user_id` on a planned record (records who entered actuals; flips the
      list badge from "Scheduled — enter time" to "Submitted"). Status stays 'submitted'.
- [x] Delete restricted to the worker's OWN, UNATTACHED entries (`user_id = self AND timesheet_id
      IS NULL`) — a sheet-attached planned record can never be deleted from the staff app.
- [x] List badge: planned record (submitted + no user_id) shows "Scheduled — enter time".
- [x] `tsc --noEmit` clean.
- NOTE: "create new" remains for exceptions only. A worker who creates instead of updating could
  duplicate a planned row — acceptable for now (update is the primary path); a future guard could
  warn if a planned entry already exists for that (employee, day, shift).
- TODO (UX, not yet built): a dedicated "today's scheduled shifts — enter your time" view so workers
  land on their planned records directly rather than scanning the history list.

## Phase 1.y — staff finalization signal (DONE 2026-06-14)
Problem: a worker can Save actual time repeatedly; status stays 'submitted' the whole time,
so the crew leader can't tell "still entering" from "done." Solution = explicit worker checkbox.

Decisions: checkbox (not a 2nd button); AOS surfacing = inline marker + day-header counter +
"Awaiting staff / Staff done / All" filter (no duplicate row list); ADVISORY (doesn't gate approval).

- [x] **Migration** `20260614a_timesheet_entries_staff_finalized.sql` — adds `staff_finalized`
      (bool, default false) + `staff_finalized_at`. Applied to dev; pending prod (see
      project_pending_prod_migrations.md memory).
- [x] **Staff app**: `staffFinalized`/`staffFinalizedAt` on StaffTimesheet + StaffEntryInput;
      buildEntryRow writes them (stamps _at when checked); rowToStaffTimesheet reads them; new+edit
      pages have a "I'm done — this is my final time for this shift" checkbox; list badge shows
      "Enter your time" vs "Final ✓ — pending approval".
- [x] **AOS** (read-only on the column — never clobbers it): TimeEntry + rowToTimeEntry mapped;
      timekeeping.tsx adds an inline "✓ Staff done / ⏳ Awaiting staff" chip per submitted row, a
      "· N staff-finalized" day-header counter, and a "Staff time: All / Awaiting staff / Staff done"
      grid filter (gated to `!hideBillAlways`).
- [x] Both apps `tsc --noEmit` clean.

## Phases
- [x] **Phase 0 — Port shared modules.** DONE 2026-06-14. Created staff `lib/calc/`:
      `types.ts` (TimeEntry, RateCardRate), `time-utils.ts` (durationMinutes etc.),
      `timekeeping.ts` (computeTimeEntry + inferPairDatesLocal), `rate-resolution.ts`
      (`resolveEntryRates()` — quote→rate-card→specialty, per timekeeping screen — + triggerToInt).
      CORRECTED 2026-06-14: initially ported the job_request/pin path (resolveRateCardForJob);
      rewrote to resolve from the most recent QUOTE to match what AOS actually bills.
      All carry sync-headers naming the AOS source. `tsc --noEmit` clean.
      NOTE: ot_after/dt_after are TriggerOption strings ("none"/"10"/"weekly40") — converted via
      ported triggerToInt ("weekly40" → 0, weekly OT is payroll-side, not a per-entry bill split).
- [x] **Phase 1 — Complete timesheet creation.** DONE 2026-06-14.
      - `lib/types.ts`: StaffTimesheet now has bill_* rates + billOtAfter/billDtAfter + jobId/
        shiftId/positionId/specialtyId + isHoliday/holidayMultiplier. Added AssignmentOption,
        PositionOption, SpecialtyOption, ShiftOption.
      - `lib/db.ts`: removed old std_rate writers. Added `StaffEntryInput` + `buildEntryRow()`
        (resolves rate card → computeTimeEntry → full V2 row) + `createStaffEntry` / `updateStaffEntry`
        (re-prices on edit, DB freeze guard kept). Added `getMyAssignments` (stitched, no FKs),
        `getPositions`, `getSpecialties`, `getJobShifts`. Updated `rowToStaffTimesheet` to bill_*.
      - new/edit pages rewritten: assignment-driven, position→specialty cascade, shift picker, live
        hours preview using resolved thresholds. `lib/time-calc.ts` trimmed to UI helpers (buggy
        8/12 computeShift removed).
      - DECISION: staff see HOURS only (Total + Std/OT/DT). The "Est. Pay" dollar card was removed —
        those were bill rates (what AES charges the client), not staff pay; not appropriate to show.
      - `tsc --noEmit` clean. (ESLint not configured in this repo.)
      - ⚠ Phase 4 must confirm the staff role can READ job_request_assignments / job_request_days /
        job_requests / job_request_shifts / rate_card_profiles / rate_card_profile_rows / specialties
        under RLS, and INSERT the new timesheet_entries columns.
      <!-- Original Phase 1 spec retained below for reference -->
      Drive the form off the staff member's
      `job_request_assignments`. Selecting an assignment PRE-FILLS job_id, work_date, is_holiday,
      shift_id, position_id, specialty_id, contact — but position / specialty / shift remain
      **editable** (staff get reassigned on-site as needs change). Cascades:
        - position → specialties via `specialties.position_id` (only that position's specialties)
        - shift options from `job_request_shifts` for the selected job
      On save (and whenever specialty changes): re-call `resolveEntryRates(jobId, specialtyId)` to
      re-snapshot bill rates/thresholds/holidayMultiplier (rates are keyed by specialty_id, so an
      on-site specialty change MUST re-price), then `computeTimeEntry`, then write the full column
      set with status='submitted', user_id.
      Approvability gates to honor: specialty required when the chosen position has specialties;
      shift required when the job has shifts. Coordinator escape hatch (no assignment → job_id null,
      default rates) is the only intentionally-incomplete path.
      Master data needed: `positions` (id, name, is_active, sort_order), `specialties`
      (id, position_id, name, is_active, sort_order).
- [ ] **Phase 2 — My Schedule onto V2.** Rewrite `getMySchedule` to query
      `job_request_assignments` by `employee_key` → days → job_requests. Show all. Update types + UI.
- [ ] **Phase 3 — Rename + cleanup.** `std/ot/dt/total` → `bill_*` across `lib/db.ts`, `lib/types.ts`,
      UI. Remove dead `getJobSheets`/`job_sheets` reads and types.
- [ ] **Phase 4 — Verify on dev.** RLS/grants for staff role on the new read tables + write columns.
      End-to-end: staff submits against an assignment → row appears in AOS fully priced & approvable
      with zero admin edits. Cross-check bill_total vs AOS for identical inputs.
