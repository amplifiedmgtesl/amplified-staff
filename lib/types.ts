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

export interface Profile {
  id: string;
  role: "staff" | "admin";
  employeeKey: string | null;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
}

// Matches TimeEntry from the ops suite — stored in timesheet_entries table
export interface StaffTimesheet {
  id: string;
  userId: string;
  timesheetId: string | null;
  jobSheetId: string | null;
  jobName: string;
  workDate: string;
  position: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  timeIn1: string;
  timeOut1: string;
  lunchMinutes: number;
  timeIn2: string;
  timeOut2: string;
  stdHours: number;
  otHours: number;
  dtHours: number;
  totalHours: number;
  stdRate: number;
  otRate: number;
  dtRate: number;
  totalPay: number;
  notes: string;
  status: "submitted" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}
