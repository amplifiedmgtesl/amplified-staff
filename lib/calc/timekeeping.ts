// ─────────────────────────────────────────────────────────────────────────────
// PORTED VERBATIM FROM AOS — source of truth: Amplified-AOS/lib/store/timekeeping.ts
// (computeTimeEntry + inferPairDatesLocal). Keep in sync. The hours/OT/DT/holiday
// math here MUST stay identical to the admin app or staff entries misprice.
// Last synced: 2026-06-14 (migration 20260606a OT/DT thresholds, 20260528b bill_*).
// ─────────────────────────────────────────────────────────────────────────────

import type { TimeEntry } from "./types";
import { durationMinutes } from "./time-utils";

export function computeTimeEntry(entry: TimeEntry): TimeEntry {
  const workDate = entry.workDate;
  // Auto-seed endDate from pair crossovers rather than trusting a saved value.
  let endDate = entry.endDate;
  let out1DateOut = workDate;
  let out2DateOut = workDate;
  if (workDate) {
    const { out1Date, out2Date } = inferPairDatesLocal(
      workDate, entry.timeIn1, entry.timeOut1, entry.timeIn2, entry.timeOut2,
    );
    out1DateOut = out1Date;
    out2DateOut = out2Date;
    endDate = out2Date;
  }

  let totalMinutes = 0;
  if (workDate) {
    totalMinutes += durationMinutes(workDate, entry.timeIn1, out1DateOut, entry.timeOut1);
    totalMinutes += durationMinutes(out1DateOut, entry.timeIn2, out2DateOut, entry.timeOut2);
  } else {
    totalMinutes += durationMinutes(undefined, entry.timeIn1, undefined, entry.timeOut1);
    totalMinutes += durationMinutes(undefined, entry.timeIn2, undefined, entry.timeOut2);
  }

  // Meal breaks: subtract both. Fall back to legacy lunchMinutes if mealBreak1
  // isn't populated (pre-migration rows).
  const break1 = entry.mealBreak1Minutes ?? entry.lunchMinutes ?? 0;
  const break2 = entry.mealBreak2Minutes ?? 0;
  totalMinutes -= break1;
  totalMinutes -= break2;
  if (totalMinutes < 0) totalMinutes = 0;

  const totalHours = +(totalMinutes / 60).toFixed(2);

  // OT/DT bucket split honors per-entry thresholds (migration 20260606a).
  // NULL → 0 (no bucket at this tier). N>0 → bucket starts after N hours.
  const otAfter = entry.billOtAfter ?? 0;
  const dtAfter = entry.billDtAfter ?? 0;
  let stdHours: number;
  let otHours: number;
  let dtHours: number;
  if (otAfter === 0 && dtAfter === 0) {
    stdHours = totalHours;
    otHours = 0;
    dtHours = 0;
  } else if (otAfter === 0) {
    stdHours = Math.min(dtAfter, totalHours);
    otHours = 0;
    dtHours = totalHours > dtAfter ? totalHours - dtAfter : 0;
  } else if (dtAfter === 0) {
    stdHours = Math.min(otAfter, totalHours);
    otHours = totalHours > otAfter ? totalHours - otAfter : 0;
    dtHours = 0;
  } else {
    const otCap = Math.min(otAfter, dtAfter);
    stdHours = Math.min(otCap, totalHours);
    otHours = totalHours > otCap ? Math.min(dtAfter - otCap, totalHours - otCap) : 0;
    dtHours = totalHours > dtAfter ? totalHours - dtAfter : 0;
  }

  // Holiday row: bill = totalHours × billStdRate × multiplier (no OT/DT stacking).
  // Non-holiday: ST/OT/DT split × respective rates.
  const mult = entry.isHoliday ? (entry.holidayMultiplier ?? 2.0) : 1;
  const billTotal = entry.isHoliday
    ? +(totalHours * entry.billStdRate * mult).toFixed(2)
    : +(stdHours * entry.billStdRate + otHours * entry.billOtRate + dtHours * entry.billDtRate).toFixed(2);

  return {
    ...entry,
    endDate,
    stdHours: +stdHours.toFixed(2),
    otHours: +otHours.toFixed(2),
    dtHours: +dtHours.toFixed(2),
    totalHours: +totalHours.toFixed(2),
    billTotal,
  };
}

// Local copy of inferPairDates to keep this module self-contained.
function inferPairDatesLocal(
  workDate: string,
  timeIn1: string,
  timeOut1: string,
  timeIn2: string,
  timeOut2: string,
) {
  const parseM = (t: string) => {
    if (!t) return null;
    const match = t.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
    if (!match) return null;
    let h = Number(match[1]);
    const mm = Number(match[2]);
    if (Number.isNaN(h) || Number.isNaN(mm)) return null;
    if (match[3] === "AM" && h === 12) h = 0;
    else if (match[3] === "PM" && h !== 12) h += 12;
    return h * 60 + mm;
  };
  const bump = (ymd: string) => {
    const d = new Date(ymd + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const in1 = parseM(timeIn1); const out1 = parseM(timeOut1);
  const in2 = parseM(timeIn2); const out2 = parseM(timeOut2);
  const in1Date = workDate;
  const out1Date = (in1 != null && out1 != null && out1 < in1) ? bump(workDate) : workDate;
  const in2Date = out1Date;
  const out2Date = (in2 != null && out2 != null && out2 < in2) ? bump(in2Date) : in2Date;
  return { in1Date, out1Date, in2Date, out2Date };
}
