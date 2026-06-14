// ─────────────────────────────────────────────────────────────────────────────
// PORTED FROM AOS — source of truth: Amplified-AOS/lib/store/types.ts (TimeEntry)
// Keep in sync. If the billing/hours fields change in AOS, mirror them here.
// Last synced: 2026-06-14 (post-migration 20260606a / 20260528b).
// ─────────────────────────────────────────────────────────────────────────────
//
// This is the exact row shape computeTimeEntry() operates on. The staff app maps
// its own StaffTimesheet <-> TimeEntry around the calc so the math stays identical
// to what AOS produces for the same inputs.

export type TimeEntry = {
  id: string;
  position: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  workDate?: string; // YYYY-MM-DD — start date of pair 1
  endDate?: string; // YYYY-MM-DD — end date of last pair (auto-seeded by computeTimeEntry)
  timeIn1: string;
  timeOut1: string;
  timeIn2: string;
  timeOut2: string;
  lunchMinutes: number; // LEGACY: kept in sync, not used in hours math
  mealBreak1Minutes?: number; // 0/30/60
  mealBreak2Minutes?: number; // 0/30/60
  stdHours: number;
  otHours: number;
  dtHours: number;
  totalHours: number;
  // Billing rates (NOT pay rates). Snapshotted from the rate card at creation.
  billStdRate: number;
  billOtRate: number;
  billDtRate: number;
  billOtAfter?: number | null; // OT bucket starts after N hours; NULL = no OT bucket
  billDtAfter?: number | null; // DT bucket starts after N hours; NULL = no DT bucket
  billTotal: number;
  employeeKey?: string | null;
  userId?: string | null;
  status?: string | null; // null=admin-created; submitted|approved|rejected for staff
  sortOrder?: number;
  createdAt?: string;
  jobId?: string | null; // job_requests(id)
  invoiceLineId?: string | null;
  shiftId?: string | null; // job_request_shifts(id)
  positionId?: string | null;
  specialtyId?: string | null;
  isHoliday?: boolean;
  holidayMultiplier?: number | null;
};

/** Resolved rate-card row for one specialty. Shape mirrors rate_card_profile_rows. */
export type RateCardRate = {
  hourly: number;
  otRate: number;
  dtRate: number;
  otAfter: number | null;
  dtAfter: number | null;
};
