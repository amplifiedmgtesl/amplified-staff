// Shared shift calculator — matches the admin app's computeTimeEntry logic
// in Amplified-AOS/lib/store/timekeeping.ts. Handles midnight-crossing pairs
// and auto-computes the end date.

function parseMin(t: string): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h * 60 + mm;
}

export function advanceDay(ymd: string): string {
  if (!ymd) return ymd;
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function computeShift(opts: {
  workDate: string;
  timeIn1: string;
  timeOut1: string;
  mealBreak1Minutes: number;
  timeIn2: string;
  timeOut2: string;
  mealBreak2Minutes: number;
  stdRate: number;
  otRate: number;
  dtRate: number;
}) {
  const in1  = parseMin(opts.timeIn1);
  const out1 = parseMin(opts.timeOut1);
  const in2  = parseMin(opts.timeIn2);
  const out2 = parseMin(opts.timeOut2);
  const pair1Crosses = in1 != null && out1 != null && out1 < in1;
  const pair2Crosses = in2 != null && out2 != null && out2 < in2;

  // end date = workDate advanced once per crossing pair
  let endDate = opts.workDate || "";
  if (endDate) {
    if (pair1Crosses) endDate = advanceDay(endDate);
    if (pair2Crosses) endDate = advanceDay(endDate);
  }

  let totalMin = 0;
  if (in1 != null && out1 != null) {
    totalMin += pair1Crosses ? (24 * 60 - in1) + out1 : out1 - in1;
  }
  if (in2 != null && out2 != null) {
    totalMin += pair2Crosses ? (24 * 60 - in2) + out2 : out2 - in2;
  }
  totalMin -= (opts.mealBreak1Minutes || 0) + (opts.mealBreak2Minutes || 0);
  if (totalMin < 0) totalMin = 0;

  const totalHours = +(totalMin / 60).toFixed(2);
  const stdHours = +Math.min(8, totalHours).toFixed(2);
  const otHours = totalHours > 8 ? +Math.min(4, totalHours - 8).toFixed(2) : 0;
  const dtHours = totalHours > 12 ? +(totalHours - 12).toFixed(2) : 0;
  const totalPay = +(stdHours * opts.stdRate + otHours * opts.otRate + dtHours * opts.dtRate).toFixed(2);

  return { endDate, totalHours, stdHours, otHours, dtHours, totalPay };
}

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
