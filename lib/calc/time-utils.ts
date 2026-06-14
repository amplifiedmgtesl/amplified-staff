// ─────────────────────────────────────────────────────────────────────────────
// PORTED VERBATIM FROM AOS — source of truth: Amplified-AOS/lib/time-utils.ts
// Keep in sync. Do not diverge the hours math from the admin app.
// Last synced: 2026-06-14.
// ─────────────────────────────────────────────────────────────────────────────
//
// Shared time helpers. The app is single-timezone; all dates/times are local
// wall-clock. Real date+time duration is used when both start and end dates are
// supplied (handles shifts that cross midnight). When dates are missing (legacy
// rows), falls back to the same-day +24h trick.

export function parseMinutes(value: string): number | null {
  if (!value) return null;
  const t = value.trim().toUpperCase();
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = Number(m[2]);
  const mer = m[3];
  if (Number.isNaN(h) || Number.isNaN(mins)) return null;
  if (mer === "AM" && h === 12) h = 0;
  else if (mer === "PM" && h !== 12) h += 12;
  return h * 60 + mins;
}

function toMoment(date: string, timeText: string): number {
  const m = parseMinutes(timeText);
  if (!date || m == null) return NaN;
  return new Date(date + "T00:00:00").getTime() + m * 60_000;
}

/**
 * Duration in minutes between a start (date + time) and end (date + time).
 * When both dates are supplied, does real calendar math. Falls back to the
 * same-day +24h trick when dates are missing. Returns 0 if invalid or end < start.
 */
export function durationMinutes(
  startDate: string | undefined,
  startTime: string,
  endDate: string | undefined,
  endTime: string,
): number {
  if (startDate && endDate) {
    const s = toMoment(startDate, startTime);
    const e = toMoment(endDate, endTime);
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
    return Math.round((e - s) / 60_000);
  }
  const s = parseMinutes(startTime);
  const e = parseMinutes(endTime);
  if (s == null || e == null) return 0;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

/** Returns `ymd` advanced by one calendar day. Input "YYYY-MM-DD", output same. */
export function advanceDay(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
