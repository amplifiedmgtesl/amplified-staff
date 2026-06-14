import { supabase } from "./supabase/client";
import type {
  Employee, Profile, ScheduledJob, StaffTimesheet,
  AssignmentOption, PositionOption, SpecialtyOption, ShiftOption,
} from "./types";
import { computeTimeEntry } from "./calc/timekeeping";
import { resolveEntryRates } from "./calc/rate-resolution";
import type { TimeEntry } from "./calc/types";

// ── My Schedule (V2) ─────────────────────────────────────────────────────────
// Sourced from job_request_assignments (by employee_key) → job_request_days →
// job_requests. The legacy job_sheets / job_sheet_workers path was retired in the
// V2 alignment — those tables are decommissioned, read-only history. One entry per
// assigned day; all assignments shown (no confirmed/upcoming filter at this layer —
// the schedule page splits upcoming vs. past).

export async function getMySchedule(employeeKey: string | null | undefined): Promise<ScheduledJob[]> {
  if (!employeeKey) return [];
  const assignments = await getMyAssignments(employeeKey);
  if (assignments.length === 0) return [];

  // Resolve display labels for position/specialty and shift.
  const [positions, specialties] = await Promise.all([getPositions(), getSpecialties()]);
  const posName = new Map(positions.map((p) => [p.id, p.name]));
  const specName = new Map(specialties.map((s) => [s.id, s.name]));

  const jobIds = [...new Set(assignments.map((a) => a.jobId).filter(Boolean))] as string[];
  const shiftLabel = new Map<string, string>();
  await Promise.all(jobIds.map(async (jid) => {
    const shifts = await getJobShifts(jid);
    shifts.forEach((s) => shiftLabel.set(s.id, s.label));
  }));

  return assignments
    .map((a): ScheduledJob => {
      const role = [
        a.positionId ? posName.get(a.positionId) : null,
        a.specialtyId ? specName.get(a.specialtyId) : null,
      ].filter(Boolean).join(" · ");
      return {
        assignmentId: a.assignmentId,
        jobId: a.jobId,
        date: a.eventDate,
        client: a.client,
        eventName: a.eventName,
        venue: a.venue,
        cityState: a.cityState,
        callTime: a.callTime,
        role,
        shiftLabel: a.shiftId ? (shiftLabel.get(a.shiftId) ?? "") : "",
        isHoliday: a.isHoliday,
        notes: a.notes,
        confirmed: a.confirmed,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Employee (read-only, linked via profile.employeeKey) ─────────────────────

export async function getEmployee(employeeKey: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("employee_key, full_name, first_name, last_name, email, phone, address, city, state")
    .eq("employee_key", employeeKey)
    .single();
  if (error || !data) return null;
  return {
    employeeKey: data.employee_key,
    fullName: data.full_name ?? "",
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    address: data.address ?? "",
    city: data.city ?? "",
    state: data.state ?? "",
  };
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return rowToProfile(data);
}

export async function upsertProfile(profile: Profile): Promise<void> {
  const { error } = await supabase.from("profiles").upsert(profileToRow(profile));
  if (error) throw error;
}

// ── Staff Timesheets (stored in timesheet_entries with user_id set) ───────────

export async function getMyTimesheets(userId: string, employeeKey?: string | null): Promise<StaffTimesheet[]> {
  // Fetch entries submitted by this user OR created by admin for this employee record
  let query = supabase.from("timesheet_entries").select("*");
  if (employeeKey) {
    query = query.or(`user_id.eq.${userId},employee_key.eq.${employeeKey}`);
  } else {
    query = query.eq("user_id", userId);
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  // Deduplicate by id (safety in case both filters match the same row)
  const seen = new Set<string>();
  const entries = (data ?? [])
    .filter((r: any) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .map(rowToStaffTimesheet);

  // Backfill the display label from the canonical job_id. AOS-created rows
  // (e.g. "+ Add Crew Member") store job_id but not the denormalized job_name,
  // which would otherwise show as a blank "Job / Event" in the staff list.
  const missing = entries.filter((e) => !e.jobName && e.jobId);
  if (missing.length) {
    const jobIds = [...new Set(missing.map((e) => e.jobId as string))];
    const { data: jobs } = await supabase
      .from("job_requests").select("id, client, event_name").in("id", jobIds);
    const label = new Map(
      (jobs ?? []).map((j: any) => [j.id, [j.client, j.event_name].filter(Boolean).join(" — ")]),
    );
    for (const e of entries) {
      if (!e.jobName && e.jobId) e.jobName = label.get(e.jobId) ?? e.jobName;
    }
  }
  return entries;
}

// Everything the staff form supplies to create/update one entry. Bill rates,
// hours, holiday multiplier and totals are NOT here — they are resolved + computed
// server-side-equivalently (same logic as AOS) so the saved row is fully priced
// and admin-ready. See lib/calc/.
export interface StaffEntryInput {
  id: string;
  userId: string | null;
  employeeKey: string | null;
  jobId: string | null;          // null = coordinator escape hatch (no job)
  jobName: string;               // display label
  shiftId: string | null;
  positionId: string | null;
  specialtyId: string | null;
  position: string;              // text label snapshot
  isHoliday: boolean;
  staffFinalized: boolean;       // worker's "I'm done" checkbox
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  workDate: string;
  timeIn1: string;
  timeOut1: string;
  timeIn2: string;
  timeOut2: string;
  mealBreak1Minutes: number;
  mealBreak2Minutes: number;
  notes: string;
  status: string | null;
}

// Resolve the rate card for (job, specialty), run the shared calc, and produce the
// full DB row. This is the single place that turns staff form input into a complete,
// approvable timesheet_entries row.
async function buildEntryRow(input: StaffEntryInput): Promise<Record<string, unknown>> {
  const rates = await resolveEntryRates(input.jobId, input.specialtyId);
  const computed: TimeEntry = computeTimeEntry({
    id: input.id,
    position: input.position,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    email: input.email,
    workDate: input.workDate,
    endDate: input.workDate,
    timeIn1: input.timeIn1,
    timeOut1: input.timeOut1,
    timeIn2: input.timeIn2,
    timeOut2: input.timeOut2,
    lunchMinutes: input.mealBreak1Minutes,
    mealBreak1Minutes: input.mealBreak1Minutes,
    mealBreak2Minutes: input.mealBreak2Minutes,
    stdHours: 0, otHours: 0, dtHours: 0, totalHours: 0,
    billStdRate: rates.billStdRate,
    billOtRate: rates.billOtRate,
    billDtRate: rates.billDtRate,
    billOtAfter: rates.billOtAfter,
    billDtAfter: rates.billDtAfter,
    billTotal: 0,
    isHoliday: input.isHoliday,
    holidayMultiplier: input.isHoliday ? rates.holidayMultiplier : null,
    jobId: input.jobId,
    shiftId: input.shiftId,
    positionId: input.positionId,
    specialtyId: input.specialtyId,
    employeeKey: input.employeeKey,
    userId: input.userId,
    status: input.status,
  });
  // NOTE: timesheet_id is intentionally NOT in this object. On create it's set to
  // null by createStaffEntry (entry enters the pending-review queue). On update it
  // is omitted so an existing value is PRESERVED — editing a crew-leader's planned
  // entry must keep it attached to the job timesheet, not detach it.
  return {
    id: computed.id,
    user_id: computed.userId ?? null,
    employee_key: computed.employeeKey ?? null,
    job_id: computed.jobId ?? null,
    job_sheet_id: null,
    shift_id: computed.shiftId ?? null,
    position_id: computed.positionId ?? null,
    specialty_id: computed.specialtyId ?? null,
    job_name: input.jobName,
    work_date: computed.workDate,
    end_date: computed.endDate || computed.workDate,
    position: computed.position,
    first_name: computed.firstName,
    last_name: computed.lastName,
    phone: computed.phone,
    email: computed.email,
    time_in1: computed.timeIn1,
    time_out1: computed.timeOut1,
    meal_break_1_minutes: computed.mealBreak1Minutes,
    time_in2: computed.timeIn2,
    time_out2: computed.timeOut2,
    meal_break_2_minutes: computed.mealBreak2Minutes,
    lunch_minutes: computed.mealBreak1Minutes, // keep legacy column in sync
    std_hours: computed.stdHours,
    ot_hours: computed.otHours,
    dt_hours: computed.dtHours,
    total_hours: computed.totalHours,
    bill_std_rate: computed.billStdRate,
    bill_ot_rate: computed.billOtRate,
    bill_dt_rate: computed.billDtRate,
    bill_ot_after: computed.billOtAfter ?? null,
    bill_dt_after: computed.billDtAfter ?? null,
    bill_total: computed.billTotal,
    is_holiday: computed.isHoliday ?? false,
    holiday_multiplier: computed.holidayMultiplier ?? null,
    staff_finalized: input.staffFinalized,
    staff_finalized_at: input.staffFinalized ? new Date().toISOString() : null,
    notes: input.notes,
    status: computed.status ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** Create a new staff timesheet entry — fully priced and ready to approve. Used for
 *  the exception paths (mid-shift reassignment, an extra unscheduled shift). New
 *  entries start unattached (timesheet_id null) so they land in the job's pending
 *  review queue. */
export async function createStaffEntry(input: StaffEntryInput): Promise<void> {
  const row = await buildEntryRow(input);
  const { error } = await supabase.from("timesheet_entries").upsert({ ...row, timesheet_id: null });
  if (error) throw error;
}

/** Update an existing entry — typically a crew-leader's PLANNED record, where the
 *  worker fills in actual time. Re-resolves rates + recomputes (so an on-site
 *  specialty/position change re-prices). Preserves timesheet_id (stays on the job
 *  sheet) and status (stays 'submitted', pending approval). Blocked once
 *  approved/rejected (app guard + DB freeze trigger). */
export async function updateStaffEntry(input: StaffEntryInput): Promise<void> {
  const { data } = await supabase.from("timesheet_entries").select("status").eq("id", input.id).single();
  if (!data || data.status === "approved" || data.status === "rejected") {
    throw new Error("This entry can no longer be edited.");
  }
  const row = await buildEntryRow(input); // no timesheet_id key → existing value preserved
  const { error } = await supabase
    .from("timesheet_entries")
    .update(row)
    .eq("id", input.id)
    .not("status", "in", '("approved","rejected")'); // DB-level guard
  if (error) throw error;
}

export async function deleteStaffTimesheet(id: string): Promise<void> {
  const { error } = await supabase.from("timesheet_entries").delete().eq("id", id);
  if (error) throw error;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToProfile(r: any): Profile {
  return {
    id: r.id,
    role: r.role ?? "staff",
    employeeKey: r.employee_key ?? null,
    fullName: r.full_name ?? "",
    email: r.email ?? "",
  };
}

function profileToRow(p: Profile) {
  return {
    id: p.id,
    role: p.role,
    employee_key: p.employeeKey ?? null,
    full_name: p.fullName,
    email: p.email,
    updated_at: new Date().toISOString(),
  };
}

function rowToStaffTimesheet(r: any): StaffTimesheet {
  return {
    id: r.id,
    userId: r.user_id ?? null,
    employeeKey: r.employee_key ?? null,
    timesheetId: r.timesheet_id ?? null,
    jobId: r.job_id ?? null,
    jobSheetId: r.job_sheet_id ?? null,
    jobName: r.job_name ?? "",
    shiftId: r.shift_id ?? null,
    positionId: r.position_id ?? null,
    specialtyId: r.specialty_id ?? null,
    workDate: r.work_date ?? "",
    endDate: r.end_date ?? "",
    position: r.position ?? "",
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    timeIn1: r.time_in1 ?? "",
    timeOut1: r.time_out1 ?? "",
    mealBreak1Minutes: r.meal_break_1_minutes ?? r.lunch_minutes ?? 30,
    timeIn2: r.time_in2 ?? "",
    timeOut2: r.time_out2 ?? "",
    mealBreak2Minutes: r.meal_break_2_minutes ?? 0,
    lunchMinutes: r.lunch_minutes ?? 30,
    stdHours: r.std_hours ?? 0,
    otHours: r.ot_hours ?? 0,
    dtHours: r.dt_hours ?? 0,
    totalHours: r.total_hours ?? 0,
    billStdRate: r.bill_std_rate ?? 35,
    billOtRate: r.bill_ot_rate ?? 52,
    billDtRate: r.bill_dt_rate ?? 70,
    billOtAfter: r.bill_ot_after == null ? null : Number(r.bill_ot_after),
    billDtAfter: r.bill_dt_after == null ? null : Number(r.bill_dt_after),
    billTotal: r.bill_total ?? 0,
    isHoliday: r.is_holiday ?? false,
    holidayMultiplier: r.holiday_multiplier == null ? null : Number(r.holiday_multiplier),
    staffFinalized: r.staff_finalized ?? false,
    staffFinalizedAt: r.staff_finalized_at ?? null,
    notes: r.notes ?? "",
    status: r.status ?? null,
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

// ── V2 scheduling + master data ───────────────────────────────────────────────

/** The assignments (job_request_assignments) this staff member can log against.
 *  No FKs exist on these tables, so we stitch with explicit batched queries. */
export async function getMyAssignments(employeeKey: string): Promise<AssignmentOption[]> {
  const { data: aData, error } = await supabase
    .from("job_request_assignments")
    .select("id, job_request_day_id, shift_id, position_id, specialty_id, confirmed, notes")
    .eq("employee_key", employeeKey);
  if (error) throw error;
  const assignments = aData ?? [];
  if (assignments.length === 0) return [];

  const dayIds = [...new Set(assignments.map((a: any) => a.job_request_day_id).filter(Boolean))];
  const { data: dData } = await supabase
    .from("job_request_days")
    .select("id, job_request_id, event_date, call_time, is_holiday")
    .in("id", dayIds);
  const days = new Map((dData ?? []).map((d: any) => [d.id, d]));

  const jobIds = [...new Set((dData ?? []).map((d: any) => d.job_request_id).filter(Boolean))];
  const { data: jData } = jobIds.length
    ? await supabase.from("job_requests").select("id, client, event_name, venue, city_state").in("id", jobIds)
    : { data: [] as any[] };
  const jobs = new Map((jData ?? []).map((j: any) => [j.id, j]));

  return assignments
    .map((a: any): AssignmentOption => {
      const day = days.get(a.job_request_day_id);
      const job = day ? jobs.get(day.job_request_id) : undefined;
      return {
        assignmentId: a.id,
        jobId: day?.job_request_id ?? null,
        shiftId: a.shift_id ?? null,
        positionId: a.position_id ?? null,
        specialtyId: a.specialty_id ?? null,
        eventDate: day?.event_date ?? "",
        isHoliday: day?.is_holiday ?? false,
        callTime: day?.call_time ?? "",
        confirmed: a.confirmed ?? false,
        notes: a.notes ?? "",
        client: job?.client ?? "",
        eventName: job?.event_name ?? "",
        venue: job?.venue ?? "",
        cityState: job?.city_state ?? "",
      };
    })
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

export async function getPositions(): Promise<PositionOption[]> {
  const { data, error } = await supabase
    .from("positions").select("id, name").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, name: r.name }));
}

export async function getSpecialties(): Promise<SpecialtyOption[]> {
  const { data, error } = await supabase
    .from("specialties").select("id, position_id, name").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, positionId: r.position_id, name: r.name }));
}

export async function getJobShifts(jobId: string): Promise<ShiftOption[]> {
  const { data, error } = await supabase
    .from("job_request_shifts").select("id, label").eq("job_request_id", jobId)
    .eq("is_active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ id: r.id, label: r.label }));
}
