"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import {
  getMyTimesheets, getProfile, getPositions, getSpecialties, getJobShifts, updateStaffEntry,
} from "@/lib/db";
import type { StaffTimesheet, PositionOption, SpecialtyOption, ShiftOption } from "@/lib/types";
import { computeTimeEntry } from "@/lib/calc/timekeeping";
import { resolveEntryRates } from "@/lib/calc/rate-resolution";
import { timeOptions5Min, MEAL_BREAK_OPTIONS } from "@/lib/time-calc";

export default function EditTimesheetPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const times = timeOptions5Min();

  const [entry, setEntry] = useState<StaffTimesheet | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    workDate: "",
    positionId: "",
    specialtyId: "",
    shiftId: "",
    timeIn1: "",
    timeOut1: "",
    mealBreak1Minutes: "30",
    timeIn2: "",
    timeOut2: "",
    mealBreak2Minutes: "0",
    notes: "",
  });
  const [finalized, setFinalized] = useState(false);
  const [rates, setRates] = useState({ billStdRate: 35, billOtRate: 52, billDtRate: 70, billOtAfter: null as number | null, billDtAfter: null as number | null });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
      const profile = await getProfile(user.id);
      const [pos, spec, all] = await Promise.all([
        getPositions(),
        getSpecialties(),
        getMyTimesheets(user.id, profile?.employeeKey ?? null),
      ]);
      const found = all.find((t) => t.id === id);
      if (!found) { router.push("/timesheets"); return; }
      if (found.status === "approved" || found.status === "rejected") {
        router.push("/timesheets"); // locked — admin already decided
        return;
      }
      setPositions(pos);
      setSpecialties(spec);
      setShifts(found.jobId ? await getJobShifts(found.jobId) : []);
      setEntry(found);
      setForm({
        workDate: found.workDate || "",
        positionId: found.positionId || "",
        specialtyId: found.specialtyId || "",
        shiftId: found.shiftId || "",
        timeIn1: found.timeIn1 || "",
        timeOut1: found.timeOut1 || "",
        mealBreak1Minutes: String(found.mealBreak1Minutes ?? found.lunchMinutes ?? 30),
        timeIn2: found.timeIn2 || "",
        timeOut2: found.timeOut2 || "",
        mealBreak2Minutes: String(found.mealBreak2Minutes ?? 0),
        notes: found.notes || "",
      });
      setFinalized(found.staffFinalized);
      setLoading(false);
    }
    load();
  }, [id]);

  // Re-resolve bill rates when specialty changes (rates keyed by specialty_id).
  useEffect(() => {
    if (!entry) return;
    let active = true;
    resolveEntryRates(entry.jobId, form.specialtyId || null).then((r) => {
      if (active) setRates({ billStdRate: r.billStdRate, billOtRate: r.billOtRate, billDtRate: r.billDtRate, billOtAfter: r.billOtAfter, billDtAfter: r.billDtAfter });
    });
    return () => { active = false; };
  }, [entry, form.specialtyId]);

  const specialtiesForPosition = useMemo(
    () => specialties.filter((s) => s.positionId === form.positionId),
    [specialties, form.positionId],
  );
  const positionRequiresSpecialty = specialtiesForPosition.length > 0;
  const jobHasShifts = shifts.length > 0;

  function handlePositionChange(positionId: string) {
    const specs = specialties.filter((s) => s.positionId === positionId);
    setForm((f) => ({ ...f, positionId, specialtyId: specs[0]?.id ?? "" }));
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const preview = computeTimeEntry({
    id: "preview", position: "", firstName: "", lastName: "", phone: "", email: "",
    workDate: form.workDate, endDate: form.workDate,
    timeIn1: form.timeIn1, timeOut1: form.timeOut1, timeIn2: form.timeIn2, timeOut2: form.timeOut2,
    lunchMinutes: Number(form.mealBreak1Minutes) || 0,
    mealBreak1Minutes: Number(form.mealBreak1Minutes) || 0,
    mealBreak2Minutes: Number(form.mealBreak2Minutes) || 0,
    stdHours: 0, otHours: 0, dtHours: 0, totalHours: 0,
    billStdRate: rates.billStdRate, billOtRate: rates.billOtRate, billDtRate: rates.billDtRate,
    billOtAfter: rates.billOtAfter, billDtAfter: rates.billDtAfter, billTotal: 0,
    isHoliday: entry?.isHoliday ?? false, holidayMultiplier: null,
  });
  const crossesMidnight = !!preview.endDate && preview.endDate !== form.workDate;
  const hasHours = preview.totalHours > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!entry) return;
    if (positionRequiresSpecialty && !form.specialtyId) { setError("Please select a specialty for this position."); return; }
    if (jobHasShifts && !form.shiftId) { setError("Please select a shift."); return; }
    setError(null);
    setSaving(true);
    try {
      const positionName = positions.find((p) => p.id === form.positionId)?.name ?? entry.position;
      await updateStaffEntry({
        id: entry.id,
        // Stamp the worker who entered actual time. Planned records start with a
        // null user_id; once the crew member fills them in, they own the actuals.
        userId: userId ?? entry.userId,
        employeeKey: entry.employeeKey,
        jobId: entry.jobId,
        jobName: entry.jobName,
        shiftId: form.shiftId || null,
        positionId: form.positionId || null,
        specialtyId: form.specialtyId || null,
        position: positionName,
        isHoliday: entry.isHoliday,
        firstName: entry.firstName,
        lastName: entry.lastName,
        phone: entry.phone,
        email: entry.email,
        workDate: form.workDate,
        timeIn1: form.timeIn1,
        timeOut1: form.timeOut1,
        timeIn2: form.timeIn2,
        timeOut2: form.timeOut2,
        mealBreak1Minutes: Number(form.mealBreak1Minutes) || 0,
        mealBreak2Minutes: Number(form.mealBreak2Minutes) || 0,
        staffFinalized: finalized,
        notes: form.notes,
        status: entry.status,
      });
      router.push("/timesheets");
    } catch (err: any) {
      setError(err.message ?? "Failed to save.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Edit Timesheet" subtitle="">
        <p className="muted">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Edit Timesheet" subtitle="Update your submitted hours">
      <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
        <div className="card">
          <h2 className="section-title">Edit Entry</h2>

          {entry?.jobName && (
            <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
              <strong>{entry.jobName}</strong>
              {entry.isHoliday && <div style={{ color: "var(--gold-dark)", fontWeight: 700 }}>Holiday rate applies</div>}
            </div>
          )}

          <div className="grid">
            <div className="grid2">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Start Date</label>
                <input type="date" value={form.workDate} onChange={set("workDate")} required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Position</label>
                <select value={form.positionId} onChange={(e) => handlePositionChange(e.target.value)} required>
                  <option value="">— Select —</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {positionRequiresSpecialty && (
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Specialty *</label>
                <select value={form.specialtyId} onChange={set("specialtyId")} required>
                  <option value="">— Select —</option>
                  {specialtiesForPosition.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {jobHasShifts && (
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Shift *</label>
                <select value={form.shiftId} onChange={set("shiftId")} required>
                  <option value="">— Select —</option>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold-dark)", marginBottom: 8 }}>Call / First Shift</div>
              <div className="grid2">
                <div>
                  <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Time In *</label>
                  <select value={form.timeIn1} onChange={set("timeIn1")} required>
                    {times.map((t) => <option key={t} value={t}>{t || "— Select —"}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Time Out *</label>
                  <select value={form.timeOut1} onChange={set("timeOut1")} required>
                    {times.map((t) => <option key={t} value={t}>{t || "— Select —"}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Meal Break 1</label>
                <select value={form.mealBreak1Minutes} onChange={set("mealBreak1Minutes")}>
                  {MEAL_BREAK_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? "No break" : `${m} min`}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold-dark)", marginBottom: 8 }}>Second Shift (optional)</div>
              <div className="grid2">
                <div>
                  <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Time In</label>
                  <select value={form.timeIn2} onChange={set("timeIn2")}>
                    {times.map((t) => <option key={t} value={t}>{t || "— None —"}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Time Out</label>
                  <select value={form.timeOut2} onChange={set("timeOut2")}>
                    {times.map((t) => <option key={t} value={t}>{t || "— None —"}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Meal Break 2</label>
                <select value={form.mealBreak2Minutes} onChange={set("mealBreak2Minutes")}>
                  {MEAL_BREAK_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? "No break" : `${m} min`}</option>)}
                </select>
              </div>
            </div>

            {crossesMidnight && (
              <div className="muted" style={{ fontSize: 13, padding: "8px 10px", background: "#fff7e6", border: "1px solid #e8c980", borderRadius: 8 }}>
                Shift crosses midnight — end date will be saved as <strong>{preview.endDate}</strong>.
              </div>
            )}

            {hasHours && (
              <div className="grid2">
                <div className="metric-card">
                  <div className="metric-label">Total Hours</div>
                  <div className="metric-value">{preview.totalHours.toFixed(2)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Std / OT / DT</div>
                  <div className="metric-value" style={{ fontSize: 18 }}>
                    {preview.stdHours.toFixed(1)} / {preview.otHours.toFixed(1)} / {preview.dtHours.toFixed(1)}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes} onChange={set("notes")} placeholder="Any additional notes…" style={{ minHeight: 60 }} />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", fontSize: 14 }}>
              <input type="checkbox" checked={finalized} onChange={(e) => setFinalized(e.target.checked)} style={{ width: 18, height: 18 }} />
              <span>I'm done — this is my final time for this shift.</span>
            </label>

            {error && <div style={{ color: "#c0392b", fontSize: 14 }}>{error}</div>}

            <div className="action-row">
              <button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button type="button" className="secondary" onClick={() => router.push("/timesheets")}>Cancel</button>
            </div>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
