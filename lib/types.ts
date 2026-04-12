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

export interface StaffTimesheet {
  id: string;
  userId: string;
  employeeKey: string | null;
  jobSheetId: string | null;
  jobName: string;
  workDate: string;
  timeIn: string;
  timeOut: string;
  breakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  position: string;
  notes: string;
  status: "submitted" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}
