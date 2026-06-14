export interface ScheduledJob {
  jobSheetId: string;
  client: string;
  eventName: string;
  venue: string;
  cityState: string;
  date: string;
  callTime: string;
  notes: string;
  role: string;
  confirmed: boolean;
}

export interface Employee {
  employeeKey: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
}

export interface Profile {
  id: string;
  role: "staff" | "admin" | "crew_leader" | "coordinator";
  employeeKey: string | null;
  fullName: string;
  email: string;
}

// Matches TimeEntry from the ops suite — stored in timesheet_entries table.
// V2: bill_* rate columns (renamed from std_rate/etc in migration 20260528b),
// plus the canonical job_id / shift_id / position_id / specialty_id FKs and the
// holiday snapshot. Rates here are BILL rates (what AES bills the client) — they
// are computed/snapshotted, never staff-entered, and not shown to staff.
export interface StaffTimesheet {
  id: string;
  userId: string | null;        // null for admin-created entries
  employeeKey: string | null;   // set when linked to an employee record
  timesheetId: string | null;
  jobId: string | null;         // job_requests(id) — canonical V2 link
  jobSheetId: string | null;    // legacy; null on new entries
  jobName: string;              // display label (client — event)
  shiftId: string | null;       // job_request_shifts(id)
  positionId: string | null;    // positions(id)
  specialtyId: string | null;   // specialties(id) — drives bill rate lookup
  workDate: string;
  endDate: string;              // auto-advanced when a shift crosses midnight
  position: string;             // text label snapshot (display + legacy)
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  timeIn1: string;
  timeOut1: string;
  mealBreak1Minutes: number;    // replaces legacy lunchMinutes for pair 1
  timeIn2: string;
  timeOut2: string;
  mealBreak2Minutes: number;    // for pair 2 split shifts
  lunchMinutes: number;         // legacy (kept for rollback / old rows)
  stdHours: number;
  otHours: number;
  dtHours: number;
  totalHours: number;
  billStdRate: number;
  billOtRate: number;
  billDtRate: number;
  billOtAfter: number | null;   // OT threshold snapshot (null = no OT bucket)
  billDtAfter: number | null;   // DT threshold snapshot (null = no DT bucket)
  billTotal: number;
  isHoliday: boolean;
  holidayMultiplier: number | null;
  staffFinalized: boolean;          // worker marked their actual time final (advisory)
  staffFinalizedAt: string | null;
  notes: string;
  status: string | null;  // null = admin-created/confirmed; submitted | approved | rejected for staff entries
  createdAt: string;
  updatedAt: string;
}

// A scheduled assignment the logged-in staff member can log time against.
// Stitched from job_request_assignments → job_request_days → job_requests.
export interface AssignmentOption {
  assignmentId: string;
  jobId: string | null;
  shiftId: string | null;
  positionId: string | null;
  specialtyId: string | null;
  eventDate: string;
  isHoliday: boolean;
  callTime: string;
  confirmed: boolean;
  client: string;
  eventName: string;
  venue: string;
  cityState: string;
}

export interface PositionOption { id: string; name: string; }
export interface SpecialtyOption { id: string; positionId: string; name: string; }
export interface ShiftOption { id: string; label: string; }
