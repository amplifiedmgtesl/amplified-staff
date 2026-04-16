"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getProfile, getJobSheets, upsertStaffTimesheet } from "@/lib/db";
import type { JobSheetOption } from "@/lib/db";

const POSITIONS = [
  "Stagehand","Rigger","Rigger 1","Audio Technician","Lighting Technician",
  "Video Technician","Fork Op","Camera Op","Operations","Lead","Other",
];

const LUNCH_OPTIONS = [0, 15, 30, 45, 60, 90];

function timeOptions() {
  const out = [""];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

function toMinutes(t: string) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function calcHours(timeIn1: string, timeOut1: string, timeIn2: string, timeOut2: string, lunchMin: number) {
  let total = 0;
  const in1 = toMinutes(timeIn1), out1 = toMinutes(timeOut1);
  const in2 = toMinutes(timeIn2), out2 = toMinutes(timeOut2);
  if (in1 != null && out1 != null && out1 > in1) total += out1 - in1;
  if (in2 != null && out2 != null && out2 > in2) total += out2 - in2;
  total -= lunchMin;
  if (total < 0) total = 0;
  const totalHours = +(total / 60).toFixed(2);
  const stdHours = +Math.min(8, totalHours).toFixed(2);
  const otHours = totalHours > 8 ? +Math.min(4, totalHours - 8).toFixed(2) : 0;
  const dtHours = totalHours > 12 ? +(totalHours - 12).toFixed(2) : 0;
  return { totalHours, stdHours, otHours, dtHours };
}

function formatJobSheetLabel(js: JobSheetOption) {
  const parts = [js.date, js.client, js.eventName, js.venue].filter(Boolean);
  return parts.join(" — ");
}

export default function NewTimesheetPage() {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];
  const times = timeOptions();

  const [jobSheets, setJobSheets] = useState<JobSheetOption[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<JobSheetOption | null>(null);
  const [profile, setProfile] = useState<{ firstName: string; lastName: string; email: string } | null>(null);
  const [loadingSheets, setLoadingSheets] = useState(true);

  const [form, setForm] = useState({
    workDate: today,
    position: "Stagehand",
    timeIn1: "",
    timeOut1: "",
    lunchMinutes: "30",
    timeIn2: "",
    timeOut2: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [p, sheets] = await Promise.all([getProfile(user.id), getJobSheets()]);
      if (p) {
        const parts = p.fullName.trim().split(" ");
        setProfile({
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" ") ?? "",
          email: p.email,
        });
      }
      setJobSheets(sheets);
      setLoadingSheets(false);
    }
    load();
  }, []);

  function handleSheetSelect(id: string) {
    const sheet = jobSheets.find((s) => s.id === id) ?? null;
    setSelectedSheet(sheet);
    if (sheet?.date) setForm((f) => ({ ...f, workDate: sheet.date }));
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { totalHours, stdHours, otHours, dtHours } = calcHours(
    form.timeIn1, form.timeOut1, form.timeIn2, form.timeOut2, Number(form.lunchMinutes) || 0
  );
  const stdRate = 35, otRate = 52.5, dtRate = 70;
  const totalPay = +(stdHours * stdRate + otHours * otRate + dtHours * dtRate).toFixed(2);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSheet) { setError("Please select a job sheet."); return; }
    setError(null);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      await upsertStaffTimesheet({
        id: `sts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: user.id,
        timesheetId: null,
        jobSheetId: selectedSheet.id,
        jobName: [selectedSheet.client, selectedSheet.eventName].filter(Boolean).join(" — "),
        workDate: form.workDate,
        position: form.position,
        firstName: profile?.firstName ?? "",
        lastName: profile?.lastName ?? "",
        phone: "",
        email: profile?.email ?? "",
        timeIn1: form.timeIn1,
        timeOut1: form.timeOut1,
        lunchMinutes: Number(form.lunchMinutes) || 0,
        timeIn2: form.timeIn2,
        timeOut2: form.timeOut2,
        stdHours,
        otHours,
        dtHours,
        totalHours,
        stdRate,
        otRate,
        dtRate,
        totalPay,
        notes: form.notes,
        status: "submitted",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      router.push("/timesheets");
    } catch (err: any) {
      setError(err.message ?? "Failed to save.");
      setSaving(false);
    }
  }

  const hasHours = totalHours > 0;

  return (
    <AppShell title="Submit Timesheet" subtitle="Enter your hours for a work day">
      <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
        <div className="card">
          <h2 className="section-title">Timesheet Entry</h2>
          <div className="grid">

            {/* Job Sheet selector */}
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                Job / Event *
              </label>
              {loadingSheets ? (
                <p className="muted" style={{ fontSize: 13 }}>Loading jobs…</p>
              ) : jobSheets.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>No job sheets available. Contact your administrator.</p>
              ) : (
                <select
                  value={selectedSheet?.id ?? ""}
                  onChange={(e) => handleSheetSelect(e.target.value)}
                  required
                >
                  <option value="">— Select a job —</option>
                  {jobSheets.map((s) => (
                    <option key={s.id} value={s.id}>{formatJobSheetLabel(s)}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Selected job details */}
            {selectedSheet && (
              <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                <div><strong>{selectedSheet.client}</strong> — {selectedSheet.eventName}</div>
                <div className="muted">{selectedSheet.venue}{selectedSheet.cityState ? `, ${selectedSheet.cityState}` : ""}</div>
                {selectedSheet.callTime && <div className="muted">Call time: {selectedSheet.callTime}</div>}
              </div>
            )}

            <div className="grid2">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Work Date *</label>
                <input type="date" value={form.workDate} onChange={set("workDate")} required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Position *</label>
                <select value={form.position} onChange={set("position")}>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

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
            </div>

            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Lunch Break</label>
              <select value={form.lunchMinutes} onChange={set("lunchMinutes")}>
                {LUNCH_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? "No lunch" : `${m} min`}</option>)}
              </select>
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
            </div>

            {hasHours && (
              <div className="grid3">
                <div className="metric-card">
                  <div className="metric-label">Total Hours</div>
                  <div className="metric-value">{totalHours.toFixed(2)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Std / OT / DT</div>
                  <div className="metric-value" style={{ fontSize: 18 }}>
                    {stdHours.toFixed(1)} / {otHours.toFixed(1)} / {dtHours.toFixed(1)}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Est. Pay</div>
                  <div className="metric-value">${totalPay.toFixed(2)}</div>
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes} onChange={set("notes")} placeholder="Any additional notes…" style={{ minHeight: 60 }} />
            </div>

            {error && <div style={{ color: "#c0392b", fontSize: 14 }}>{error}</div>}

            <div className="action-row">
              <button type="submit" disabled={saving || !selectedSheet}>
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
