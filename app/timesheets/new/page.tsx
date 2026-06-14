"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import {
  getProfile, getEmployee, getMyAssignments, getPositions, getSpecialties,
  getJobShifts, createStaffEntry,
} from "@/lib/db";
import type { AssignmentOption, PositionOption, SpecialtyOption, ShiftOption } from "@/lib/types";
import { computeTimeEntry } from "@/lib/calc/timekeeping";
import { resolveEntryRates } from "@/lib/calc/rate-resolution";
import { timeOptions5Min, MEAL_BREAK_OPTIONS } from "@/lib/time-calc";

function assignmentLabel(a: AssignmentOption) {
  const parts = [a.eventDate, a.client, a.eventName].filter(Boolean);
  return parts.join(" — ");
}

export default function NewTimesheetPage() {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];
  const times = timeOptions5Min();

  const [profile, setProfile] = useState<{ firstName: string; lastName: string; email: string; phone: string; employeeKey: string | null; role: string } | null>(null);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    assignmentId: "",
    jobId: null as string | null,
    jobName: "",
    isHoliday: false,
    workDate: today,
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
  // Bill-rate snapshot for the current (job, specialty) — used for the live hours
  // preview and re-resolved authoritatively at save time.
  const [rates, setRates] = useState({ billStdRate: 35, billOtRate: 52, billDtRate: 70, billOtAfter: null as number | null, billDtAfter: null as number | null });
  const [finalized, setFinalized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCoordinator = profile?.role === "coordinator" || profile?.role === "admin";

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const p = await getProfile(user.id);
      const [emp, asg, pos, spec] = await Promise.all([
        p?.employeeKey ? getEmployee(p.employeeKey) : Promise.resolve(null),
        p?.employeeKey ? getMyAssignments(p.employeeKey) : Promise.resolve([]),
        getPositions(),
        getSpecialties(),
      ]);
      if (p) {
        setProfile({
          firstName: emp?.firstName || (p.fullName.trim().split(" ")[0] ?? ""),
          lastName: emp?.lastName || (p.fullName.trim().split(" ").slice(1).join(" ") ?? ""),
          email: emp?.email || p.email,
          phone: emp?.phone ?? "",
          employeeKey: p.employeeKey ?? null,
          role: p.role,
        });
      }
      setAssignments(asg);
      setPositions(pos);
      setSpecialties(spec);
      setLoading(false);
    }
    load();
  }, []);

  // Re-resolve bill rates whenever the job or specialty changes (rates are keyed
  // by specialty_id, so an on-site specialty change must re-price).
  useEffect(() => {
    let active = true;
    resolveEntryRates(form.jobId, form.specialtyId || null).then((r) => {
      if (active) setRates({ billStdRate: r.billStdRate, billOtRate: r.billOtRate, billDtRate: r.billDtRate, billOtAfter: r.billOtAfter, billDtAfter: r.billDtAfter });
    });
    return () => { active = false; };
  }, [form.jobId, form.specialtyId]);

  const specialtiesForPosition = useMemo(
    () => specialties.filter((s) => s.positionId === form.positionId),
    [specialties, form.positionId],
  );
  const positionRequiresSpecialty = specialtiesForPosition.length > 0;
  const jobHasShifts = shifts.length > 0;

  async function handleAssignmentSelect(assignmentId: string) {
    const a = assignments.find((x) => x.assignmentId === assignmentId) ?? null;
    if (!a) {
      setForm((f) => ({ ...f, assignmentId: "", jobId: null, jobName: "", isHoliday: false, shiftId: "" }));
      setShifts([]);
      return;
    }
    setForm((f) => ({
      ...f,
      assignmentId,
      jobId: a.jobId,
      jobName: [a.client, a.eventName].filter(Boolean).join(" — "),
      isHoliday: a.isHoliday,
      workDate: a.eventDate || f.workDate,
      positionId: a.positionId ?? f.positionId,
      specialtyId: a.specialtyId ?? "",
      shiftId: a.shiftId ?? "",
    }));
    setShifts(a.jobId ? await getJobShifts(a.jobId) : []);
  }

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
    isHoliday: form.isHoliday, holidayMultiplier: null,
  });
  const crossesMidnight = !!preview.endDate && preview.endDate !== form.workDate;
  const hasHours = preview.totalHours > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.assignmentId && !isCoordinator) { setError("Please select a job you're assigned to."); return; }
    if (positionRequiresSpecialty && !form.specialtyId) { setError("Please select a specialty for this position."); return; }
    if (jobHasShifts && !form.shiftId) { setError("Please select a shift."); return; }
    setError(null);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const positionName = positions.find((p) => p.id === form.positionId)?.name ?? "";

      await createStaffEntry({
        id: `sts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: user.id,
        employeeKey: profile?.employeeKey ?? null,
        jobId: form.jobId,
        jobName: form.jobName || "Office / Remote",
        shiftId: form.shiftId || null,
        positionId: form.positionId || null,
        specialtyId: form.specialtyId || null,
        position: positionName,
        isHoliday: form.isHoliday,
        firstName: profile?.firstName ?? "",
        lastName: profile?.lastName ?? "",
        phone: profile?.phone ?? "",
        email: profile?.email ?? "",
        workDate: form.workDate,
        timeIn1: form.timeIn1,
        timeOut1: form.timeOut1,
        timeIn2: form.timeIn2,
        timeOut2: form.timeOut2,
        mealBreak1Minutes: Number(form.mealBreak1Minutes) || 0,
        mealBreak2Minutes: Number(form.mealBreak2Minutes) || 0,
        staffFinalized: finalized,
        notes: form.notes,
        status: "submitted",
      });
      router.push("/timesheets");
    } catch (err: any) {
      setError(err.message ?? "Failed to save.");
      setSaving(false);
    }
  }

  const selected = assignments.find((a) => a.assignmentId === form.assignmentId) ?? null;

  return (
    <AppShell title="Submit Timesheet" subtitle="Enter your hours for a work day">
      <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
        <div className="card">
          <h2 className="section-title">Timesheet Entry</h2>
          <div className="grid">

            {/* Assignment selector */}
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                Job / Event *
              </label>
              {loading ? (
                <p className="muted" style={{ fontSize: 13 }}>Loading jobs…</p>
              ) : assignments.length === 0 && !isCoordinator ? (
                <p className="muted" style={{ fontSize: 13 }}>You have no scheduled jobs. Contact your administrator.</p>
              ) : (
                <select value={form.assignmentId} onChange={(e) => handleAssignmentSelect(e.target.value)} required={!isCoordinator}>
                  <option value="">{isCoordinator ? "— Office / Remote (no job) —" : "— Select a job —"}</option>
                  {assignments.map((a) => (
                    <option key={a.assignmentId} value={a.assignmentId}>{assignmentLabel(a)}</option>
                  ))}
                </select>
              )}
            </div>

            {selected && (
              <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                <div><strong>{selected.client}</strong>{selected.eventName ? ` — ${selected.eventName}` : ""}</div>
                <div className="muted">{selected.venue}{selected.cityState ? `, ${selected.cityState}` : ""}</div>
                {selected.callTime && <div className="muted">Call time: {selected.callTime}</div>}
                {selected.isHoliday && <div style={{ color: "var(--gold-dark)", fontWeight: 700 }}>Holiday rate applies</div>}
              </div>
            )}

            <div className="grid2">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Start Date *</label>
                <input type="date" value={form.workDate} onChange={set("workDate")} required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Position *</label>
                <select value={form.positionId} onChange={(e) => handlePositionChange(e.target.value)} required>
                  <option value="">— Select —</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {/* Specialty (only when the chosen position has specialties) */}
            {positionRequiresSpecialty && (
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Specialty *</label>
                <select value={form.specialtyId} onChange={set("specialtyId")} required>
                  <option value="">— Select —</option>
                  {specialtiesForPosition.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Shift (only when the job defines shifts) */}
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
              <button type="submit" disabled={saving || (!form.assignmentId && !isCoordinator)}>
                {saving ? "Submitting…" : "Submit Timesheet"}
              </button>
              <button type="button" className="secondary" onClick={() => router.back()}>Cancel</button>
            </div>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
