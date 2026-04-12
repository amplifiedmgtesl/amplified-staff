"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { upsertStaffTimesheet } from "@/lib/db";

function calcHours(timeIn: string, timeOut: string, breakMin: number): { reg: number; ot: number } {
  if (!timeIn || !timeOut) return { reg: 0, ot: 0 };
  const [inH, inM] = timeIn.split(":").map(Number);
  const [outH, outM] = timeOut.split(":").map(Number);
  const totalMin = (outH * 60 + outM) - (inH * 60 + inM) - breakMin;
  if (totalMin <= 0) return { reg: 0, ot: 0 };
  const total = totalMin / 60;
  const reg = Math.min(total, 8);
  const ot = Math.max(0, total - 8);
  return { reg: Math.round(reg * 100) / 100, ot: Math.round(ot * 100) / 100 };
}

export default function NewTimesheetPage() {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    workDate: today,
    jobName: "",
    position: "",
    timeIn: "",
    timeOut: "",
    breakMinutes: "0",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { reg, ot } = calcHours(form.timeIn, form.timeOut, Number(form.breakMinutes) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      await upsertStaffTimesheet({
        id: `sts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        userId: user.id,
        employeeKey: null,
        jobSheetId: null,
        jobName: form.jobName,
        workDate: form.workDate,
        timeIn: form.timeIn,
        timeOut: form.timeOut,
        breakMinutes: Number(form.breakMinutes) || 0,
        regularHours: reg,
        overtimeHours: ot,
        position: form.position,
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

  return (
    <AppShell title="Submit Timesheet" subtitle="Enter your hours for a work day">
      <form onSubmit={handleSubmit} style={{ maxWidth: 580 }}>
        <div className="card">
          <h2 className="section-title">Timesheet Entry</h2>
          <div className="grid">
            <div className="grid2">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Work Date *</label>
                <input type="date" value={form.workDate} onChange={set("workDate")} required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Position / Role</label>
                <input value={form.position} onChange={set("position")} placeholder="e.g. Stage Hand, Rigger" />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Job / Event Name</label>
              <input value={form.jobName} onChange={set("jobName")} placeholder="e.g. Taylor Swift — Allegiant Stadium" />
            </div>

            <div className="grid3">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Time In *</label>
                <input type="time" value={form.timeIn} onChange={set("timeIn")} required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Time Out *</label>
                <input type="time" value={form.timeOut} onChange={set("timeOut")} required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Break (min)</label>
                <input type="number" min="0" max="120" value={form.breakMinutes} onChange={set("breakMinutes")} />
              </div>
            </div>

            {(form.timeIn && form.timeOut) && (
              <div className="grid2">
                <div className="metric-card">
                  <div className="metric-label">Regular Hours</div>
                  <div className="metric-value">{reg.toFixed(2)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Overtime Hours</div>
                  <div className="metric-value">{ot.toFixed(2)}</div>
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Notes</label>
              <textarea value={form.notes} onChange={set("notes")} placeholder="Any additional notes…" style={{ minHeight: 70 }} />
            </div>

            {error && <div style={{ color: "#c0392b", fontSize: 14 }}>{error}</div>}

            <div className="action-row">
              <button type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit Timesheet"}</button>
              <button type="button" className="secondary" onClick={() => router.back()}>Cancel</button>
            </div>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
