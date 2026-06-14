// ─────────────────────────────────────────────────────────────────────────────
// PORTED FROM AOS — source of truth: Amplified-AOS/components/shared/timekeeping.tsx
// (the job-meta useEffect, ~lines 524-568, + triggerToInt at 39-44). Keep in sync.
// ─────────────────────────────────────────────────────────────────────────────
//
// IMPORTANT — rate cards for TIMESHEETS come from the QUOTE, not the job_request.
// The AOS timekeeping screen resolves the rate card from the job's MOST RECENT
// quote (quotes.rate_card_profile_id + quotes.holiday_multiplier). The V2 snapshot
// pattern locks the rate card to the quote, so that is the source of truth for what
// AES bills. We deliberately do NOT use job_requests.rate_card_profile_id or the
// client/effective-date fallback (pickRateCardForJob) here — those drive the quote/
// invoice builders, a different path. Mirror the timekeeping screen exactly so a
// staff entry prices identically to an admin-added crew row.
//
// No quote / no profile on the quote / no row for the specialty → 35/52/70 defaults
// (same as AOS, which leaves the row on blankTimeEntry defaults in those cases).

import { supabase } from "../supabase/client";

export type ResolvedEntryRates = {
  /** Bill-rate snapshot to merge into a TimeEntry before computeTimeEntry. */
  billStdRate: number;
  billOtRate: number;
  billDtRate: number;
  billOtAfter: number | null;
  billDtAfter: number | null;
  /** Holiday multiplier from the quote (default 2.0 when unset). */
  holidayMultiplier: number;
  /** True when a rate card row matched the specialty; false = defaults used. */
  matched: boolean;
};

/** Default bill rates — mirror AOS blankTimeEntry (35/52/70, no OT/DT bucket). */
const DEFAULT_RATES = { billStdRate: 35, billOtRate: 52, billDtRate: 70, billOtAfter: null, billDtAfter: null };

/** PORTED from AOS components/shared/timekeeping.tsx:39-44. Map rate-card
 *  TriggerOption text → integer hour threshold for the per-entry snapshot.
 *  "none"/""/"weekly40" → 0 (no daily bucket; weekly OT is a payroll-side rule,
 *  not a per-entry bill split). Numeric strings → the threshold. Else → null. */
function triggerToInt(v: string | null | undefined): number | null {
  if (v == null) return null;
  if (v === "none" || v === "" || v === "weekly40") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve frozen bill rates + thresholds for one (job, specialty), exactly as the
 * AOS timekeeping screen does: most-recent quote → rate_card_profile_id +
 * holiday_multiplier → rate_card_profile_rows matched by specialty_id.
 */
export async function resolveEntryRates(
  jobRequestId: string | null | undefined,
  specialtyId: string | null | undefined,
): Promise<ResolvedEntryRates> {
  if (!jobRequestId) {
    return { ...DEFAULT_RATES, holidayMultiplier: 2.0, matched: false };
  }

  // Most recent quote for this job is the billing source of truth.
  const { data: qData, error: qErr } = await supabase
    .from("quotes")
    .select("holiday_multiplier, rate_card_profile_id")
    .eq("job_request_id", jobRequestId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (qErr) throw qErr;
  const quote = qData?.[0] as any;
  const holidayMultiplier = quote?.holiday_multiplier == null ? 2.0 : Number(quote.holiday_multiplier);
  const profileId = quote?.rate_card_profile_id as string | null | undefined;

  if (!profileId || !specialtyId) {
    return { ...DEFAULT_RATES, holidayMultiplier, matched: false };
  }

  const { data: rows, error: rErr } = await supabase
    .from("rate_card_profile_rows")
    .select("specialty_id, hourly, ot_rate, dt_rate, ot_after, dt_after")
    .eq("profile_id", profileId);
  if (rErr) throw rErr;

  const row = (rows ?? []).find((r: any) => r.specialty_id === specialtyId);
  if (!row) {
    return { ...DEFAULT_RATES, holidayMultiplier, matched: false };
  }

  const num = (v: any, d: number) => (v == null ? d : Number(v));
  return {
    billStdRate: num(row.hourly, 35),
    billOtRate: num(row.ot_rate, 52),
    billDtRate: num(row.dt_rate, 70),
    billOtAfter: triggerToInt(row.ot_after),
    billDtAfter: triggerToInt(row.dt_after),
    holidayMultiplier,
    matched: true,
  };
}
