import { supabase } from "./supabase/client";
import type { Profile, StaffTimesheet } from "./types";

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

// ── Staff Timesheets ──────────────────────────────────────────────────────────

export async function getMyTimesheets(userId: string): Promise<StaffTimesheet[]> {
  const { data, error } = await supabase
    .from("staff_timesheets")
    .select("*")
    .eq("user_id", userId)
    .order("work_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToStaffTimesheet);
}

export async function upsertStaffTimesheet(entry: StaffTimesheet): Promise<void> {
  const { error } = await supabase.from("staff_timesheets").upsert(staffTimesheetToRow(entry));
  if (error) throw error;
}

export async function deleteStaffTimesheet(id: string): Promise<void> {
  const { error } = await supabase.from("staff_timesheets").delete().eq("id", id);
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
    phone: r.phone ?? "",
    address: r.address ?? "",
    city: r.city ?? "",
    state: r.state ?? "",
  };
}

function profileToRow(p: Profile) {
  return {
    id: p.id,
    role: p.role,
    employee_key: p.employeeKey ?? null,
    full_name: p.fullName,
    email: p.email,
    phone: p.phone,
    address: p.address,
    city: p.city,
    state: p.state,
    updated_at: new Date().toISOString(),
  };
}

function rowToStaffTimesheet(r: any): StaffTimesheet {
  return {
    id: r.id,
    userId: r.user_id,
    employeeKey: r.employee_key ?? null,
    jobSheetId: r.job_sheet_id ?? null,
    jobName: r.job_name ?? "",
    workDate: r.work_date ?? "",
    timeIn: r.time_in ?? "",
    timeOut: r.time_out ?? "",
    breakMinutes: r.break_minutes ?? 0,
    regularHours: r.regular_hours ?? 0,
    overtimeHours: r.overtime_hours ?? 0,
    position: r.position ?? "",
    notes: r.notes ?? "",
    status: r.status ?? "submitted",
    createdAt: r.created_at ?? "",
    updatedAt: r.updated_at ?? "",
  };
}

function staffTimesheetToRow(t: StaffTimesheet) {
  return {
    id: t.id,
    user_id: t.userId,
    employee_key: t.employeeKey ?? null,
    job_sheet_id: t.jobSheetId ?? null,
    job_name: t.jobName,
    work_date: t.workDate,
    time_in: t.timeIn,
    time_out: t.timeOut,
    break_minutes: t.breakMinutes,
    regular_hours: t.regularHours,
    overtime_hours: t.overtimeHours,
    position: t.position,
    notes: t.notes,
    status: t.status,
    updated_at: new Date().toISOString(),
  };
}
