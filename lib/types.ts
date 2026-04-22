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
  role: "staff" | "admin" | "crew_leader";
  employeeKey: string | null;
  fullName: string;
  email: string;
}

// Matches TimeEntry from the ops suite — stored in timesheet_entries table
export interface StaffTimesheet {
  id: string;
  userId: string | null;        // null for admin-created entries
  employeeKey: string | null;   // set when linked to an employee record
  timesheetId: string | null;
  jobSheetId: string | null;
  jobName: string;
  workDate: string;
  endDate: string;              // auto-advanced when a shift crosses midnight
  position: string;
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
  stdRate: number;
  otRate: number;
  dtRate: number;
  totalPay: number;
  notes: string;
  status: string | null;  // null = admin-created/confirmed; submitted | approved | rejected for staff entries
  createdAt: string;
  updatedAt: string;
}
