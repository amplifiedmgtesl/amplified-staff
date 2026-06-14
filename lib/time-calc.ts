// UI helpers for the timesheet forms (time dropdown + meal-break options).
//
// The hours / OT-DT / holiday MATH now lives in lib/calc/timekeeping.ts
// (computeTimeEntry), ported verbatim from the AOS admin app so staff entries
// price identically. The old local computeShift() (which hardcoded 8/12 OT/DT
// thresholds — the bug AOS fixed in migration 20260606a) was removed 2026-06-14.

export function timeOptions5Min(): string[] {
  const out = [""];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

export const MEAL_BREAK_OPTIONS = [0, 30, 60];
