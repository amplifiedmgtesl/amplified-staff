// ─────────────────────────────────────────────────────────────────────────────
// PORTED FROM AOS — source of truth: Amplified-AOS/components/shared/timekeeping.tsx
// (the job-meta useEffect, "#57" block) + lib/store/quotes.ts (resolveRateCardForJob /
// pickRateCardForJob) + triggerToInt. Keep in sync.
// ─────────────────────────────────────────────────────────────────────────────
//
// Rate card for a TIMESHEET entry, in order (AOS #57, round-3 review call 13):
//   1. the job's MOST RECENT quote (quotes.rate_card_profile_id) — the V2 snapshot
//      pattern locks the rate card to the quote, so it wins when present;
//   2. no quote / no card on the quote → the job's pinned card
//      (job_requests.rate_card_profile_id);
//   3. else the client's card effective on the job start date, then the master
//      default — the same chain the quote builder uses (pickRateCardForJob).
// Holiday multiplier: the quote's; when the quote has none and the card came from
// the fallback chain, the card's; else 2.0.
//
// No card / no specialty / no row for the specialty → bill rates of 0, which AOS
// shows as "Rate TBD" (#57 — never an invented $35/52/70).

import { supabase } from "../supabase/client";

export type ResolvedEntryRates = {
  /** Bill-rate snapshot to merge into a TimeEntry before computeTimeEntry. */
  billStdRate: number;
  billOtRate: number;
  billDtRate: number;
  billOtAfter: number | null;
  billDtAfter: number | null;
  /** Holiday multiplier (quote's, else the resolved card's, else 2.0). */
  holidayMultiplier: number;
  /** True when a rate card row matched the specialty; false = unpriced (Rate TBD). */
  matched: boolean;
};

/** Unpriced — AOS blankTimeEntry carries 0 bill rates (#57). */
const UNPRICED = { billStdRate: 0, billOtRate: 0, billDtRate: 0, billOtAfter: null, billDtAfter: null };

const MASTER_DEFAULT_ID = "ratecard-master-default";

/** PORTED from AOS components/shared/timekeeping.tsx. Map rate-card
 *  TriggerOption text → integer hour threshold for the per-entry snapshot.
 *  "none"/""/"weekly40" → 0 (no daily bucket; weekly OT is a payroll-side rule,
 *  not a per-entry bill split). Numeric strings → the threshold. Else → null. */
function triggerToInt(v: string | null | undefined): number | null {
  if (v == null) return null;
  if (v === "none" || v === "" || v === "weekly40") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type CardRef = { id: string; holidayMultiplier: number };

function toCard(data: any): CardRef {
  return { id: data.id, holidayMultiplier: data.holiday_multiplier != null ? Number(data.holiday_multiplier) : 2.0 };
}

/** PORTED from AOS lib/store/quotes.ts pickRateCardForJob — same six steps. */
async function pickRateCardForJob(clientId: string | null | undefined, jobStartDate: string | null | undefined): Promise<CardRef | null> {
  const one = async (q: any): Promise<CardRef | null> => {
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return data ? toCard(data) : null;
  };
  const cards = () => supabase.from("rate_card_profiles").select("id, holiday_multiplier");
  let hit: CardRef | null = null;
  // 1. Client-specific, effective on/before job
  if (clientId && jobStartDate) {
    hit = await one(cards().eq("client_id", clientId).lte("effective_date", jobStartDate).order("effective_date", { ascending: false }));
    if (hit) return hit;
  }
  // 2. Client-specific, NULL effective_date (legacy)
  if (clientId) {
    hit = await one(cards().eq("client_id", clientId).is("effective_date", null));
    if (hit) return hit;
  }
  // 3. Master default, effective on/before job
  if (jobStartDate) {
    hit = await one(cards().eq("id", MASTER_DEFAULT_ID).lte("effective_date", jobStartDate).order("effective_date", { ascending: false }));
    if (hit) return hit;
  }
  // 4. Master default, NULL effective_date
  hit = await one(cards().eq("id", MASTER_DEFAULT_ID).is("effective_date", null));
  if (hit) return hit;
  // 5. Any client-specific card (date-blind)
  if (clientId) {
    hit = await one(cards().eq("client_id", clientId).order("effective_date", { ascending: false, nullsFirst: false }));
    if (hit) return hit;
  }
  // 6. Master default (date-blind)
  return one(cards().eq("id", MASTER_DEFAULT_ID));
}

/** PORTED from AOS lib/store/quotes.ts resolveRateCardForJob — pin wins, else the chain. */
async function resolveRateCardForJob(jobRequestId: string): Promise<CardRef | null> {
  const { data: job, error } = await supabase
    .from("job_requests")
    .select("client_id, request_date, rate_card_profile_id")
    .eq("id", jobRequestId)
    .maybeSingle();
  if (error) throw error;
  if (!job) return null;
  if ((job as any).rate_card_profile_id) {
    const { data: pinned, error: pErr } = await supabase
      .from("rate_card_profiles")
      .select("id, holiday_multiplier")
      .eq("id", (job as any).rate_card_profile_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (pinned) return toCard(pinned);
  }
  return pickRateCardForJob((job as any).client_id, (job as any).request_date);
}

/**
 * Resolve frozen bill rates + thresholds for one (job, specialty), exactly as the
 * AOS timekeeping screen does (see header).
 */
export async function resolveEntryRates(
  jobRequestId: string | null | undefined,
  specialtyId: string | null | undefined,
): Promise<ResolvedEntryRates> {
  if (!jobRequestId) {
    return { ...UNPRICED, holidayMultiplier: 2.0, matched: false };
  }

  // Most recent quote for this job is the billing source of truth when it exists.
  const { data: qData, error: qErr } = await supabase
    .from("quotes")
    .select("holiday_multiplier, rate_card_profile_id")
    .eq("job_request_id", jobRequestId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (qErr) throw qErr;
  const quote = qData?.[0] as any;
  let holidayMultiplier = quote?.holiday_multiplier == null ? 2.0 : Number(quote.holiday_multiplier);
  let profileId = quote?.rate_card_profile_id as string | null | undefined;

  if (!profileId) {
    const card = await resolveRateCardForJob(jobRequestId);
    if (card) {
      profileId = card.id;
      if (quote?.holiday_multiplier == null) holidayMultiplier = card.holidayMultiplier;
    }
  }

  if (!profileId || !specialtyId) {
    return { ...UNPRICED, holidayMultiplier, matched: false };
  }

  const { data: rows, error: rErr } = await supabase
    .from("rate_card_profile_rows")
    .select("specialty_id, hourly, ot_rate, dt_rate, ot_after, dt_after")
    .eq("profile_id", profileId);
  if (rErr) throw rErr;

  const row = (rows ?? []).find((r: any) => r.specialty_id === specialtyId);
  if (!row) {
    return { ...UNPRICED, holidayMultiplier, matched: false };
  }

  return {
    billStdRate: Number(row.hourly ?? 0),
    billOtRate: Number(row.ot_rate ?? 0),
    billDtRate: Number(row.dt_rate ?? 0),
    billOtAfter: triggerToInt(row.ot_after),
    billDtAfter: triggerToInt(row.dt_after),
    holidayMultiplier,
    matched: true,
  };
}
