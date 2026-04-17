import { supabase } from "./supabase/client";
import type { Employee, Profile, ScheduledJob, StaffTimesheet } from "./types";

export interface JobSheetOption {
  id: string;
  title: string;
  client: string;
  eventName: string;
  venue: string;
  cityState: string;
  date: string;
  callTime: string;
}

// ── My Schedule (jobs the logged-in user is assigned to) ─────────────────────

export async function getMySchedule(userEmail: string): Promise<ScheduledJob[]> {
  const { data, error } = await supabase
    .from("job_sheet_workers")
    .select(`
      role,
      confirmed,
      job_sheets (
        id, client, event_name, venue, city_state, date, call_time, notes
      )
    `)
    .eq("email", userEmail);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => {
      const js = r.job_sheets;
      if (!js) return null;
      return {
        jobSheetId: js.id,
        client: js.client ?? "",
        eventName: js.event_name ?? "",
        venue: js.venue ?? "",
        cityState: js.city_state ?? "",
        date: js.date ?? "",
        callTime: js.call_time ?? "",
        notes: js.notes ?? "",
        role: r.role ?? "",
        confirmed: r.confirmed ?? false,
      } as ScheduledJob;
    })
    .filter((j): j is ScheduledJob => j !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Job Sheets (read-only for staff) ─────────────────────────────────────────

export async function getJobSheets(): Promise<JobSheetOption[]> {
  const { data, error } = await supabase
    .from("job_sheets")
    .select("id, title, client, event_name, venue, city_state, date, call_time")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title ?? "",
    client: r.client ?? "",
    eventName: r.event_name ?? "",
    venue: r.venue ?? "",
    cityState: r.city_state ?? "",
    date: r.date ?? "",
    callTime: r.call_time ?? "",
  }));
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
  return (data ?? [])
    .filter((r: any) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .map(rowToStaffTimesheet);
}

export async function updateStaffTimesheet(id: string, updates: Partial<StaffTimesheet>): Promise<void> {
  // Safety check — only allow editing entries that are still in "submitted" state
  const { data } = await supabase.from("timesheet_entries").select("status").eq("id", id).single();
  if (!data || data.status !== "submitted") throw new Error("This entry can no longer be edited.");
  const { error } = await supabase
    .from("timesheet_entries")
    .update({
      position: updates.position,
      time_in1: updates.timeIn1,
      time_out1: updates.timeOut1,
      lunch_minutes: updates.lunchMinutes,
      time_in2: updates.timeIn2,
      time_out2: updates.timeOut2,
      std_hours: updates.stdHours,
      ot_hours: updates.otHours,
      dt_hours: updates.dtHours,
      total_hours: updates.totalHours,
      std_rate: updates.stdRate,
      ot_rate: updates.otRate,
      dt_rate: updates.dtRate,
      total_pay: updates.totalPay,
      notes: updates.notes,
      work_date: updates.workDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "submitted"); // double-safety: DB-level guard
  if (error) throw error;
}

export async function upsertStaffTimesheet(entry: StaffTimesheet): Promise<void> {
  const { error } = await supabase
    .from("timesheet_entries")
    .upsert(staffTimesheetToRow(entry));
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
    jobSheetId: r.job_sheet_id ?? null,
    jobName: r.job_name ?? "",
    workDate: r.work_date ?? "",
    position: r.position ?? "",
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    timeIn1: r.time_in1 ?? "",
    timeOut1: r.time_out1 ?? "",
    lunchMinutes: r.lunch_minutes ?? 30,
    timeIn2: r.time_in2 ?? "",
    timeOut2: r.time_out2 ?? "",
    stdHours: r.std_hours ?? 0,
    otHours: r.ot_hours ?? 0,
    dtHours: r.dt_hours ?? 0,
    totalHours: r.total_hours ?? 0,
    stdRate: r.std_rate ?? 35,
    otRate: r.ot_rate ?? 52,
    dtRate: r.dt_rate ?? 70,
    totalPay: r.total_pay ?? 0,
    notes: r.notes ?? "",
    status: r.status ?? null,
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

function staffTimesheetToRow(t: StaffTimesheet) {
  return {
    id: t.id,
    user_id: t.userId,
    employee_key: t.employeeKey ?? null,
    timesheet_id: t.timesheetId ?? null,
    job_sheet_id: t.jobSheetId ?? null,
    job_name: t.jobName,
    work_date: t.workDate,
    position: t.position,
    first_name: t.firstName,
    last_name: t.lastName,
    phone: t.phone,
    email: t.email,
    time_in1: t.timeIn1,
    time_out1: t.timeOut1,
    lunch_minutes: t.lunchMinutes,
    time_in2: t.timeIn2,
    time_out2: t.timeOut2,
    std_hours: t.stdHours,
    ot_hours: t.otHours,
    dt_hours: t.dtHours,
    total_hours: t.totalHours,
    std_rate: t.stdRate,
    ot_rate: t.otRate,
    dt_rate: t.dtRate,
    total_pay: t.totalPay,
    notes: t.notes,
    status: t.status,
    updated_at: new Date().toISOString(),
  };
}
