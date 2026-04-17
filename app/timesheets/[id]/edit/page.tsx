"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getMyTimesheets, updateStaffTimesheet } from "@/lib/db";
import type { StaffTimesheet } from "@/lib/types";

const POSITIONS_FALLBACK = [
  "Stagehand","Stagehand Lead","Rigger","Head Rigger","Audio Technician",
  "Lighting Technician","Video Technician","Forklift Operator","Camera Operator",
  "Operations","Lead","Heavy Equipment Op","Aerial Lift Operator","General Labor","Other",
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

export default function EditTimesheetPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const times = timeOptions();

  const [entry, setEntry] = useState<StaffTimesheet | null>(null);
  const [positions, setPositions] = useState<string[]>(POSITIONS_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    workDate: "",
    position: "Stagehand",
    timeIn1: "",
    timeOut1: "",
    lunchMinutes: "30",
    timeIn2: "",
    timeOut2: "",
    notes: "",
  });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const [posRes] = await Promise.all([
        supabase.from("positions").select("name").eq("is_active", true).order("sort_order"),
      ]);
      if (posRes.data && posRes.data.length > 0) {
        setPositions(posRes.data.map((r: any) => r.name));
      }

      const all = await getMyTimesheets(user.id);
      const found = all.find((t) => t.id === id);

      if (!found) { router.push("/timesheets"); return; }
      if (found.status === "approved" || found.status === "rejected") {
        // Locked — admin has already made a decision
        router.push("/timesheets");
        return;
      }

      setEntry(found);
      setForm({
        workDate: found.workDate || "",
        position: found.position || "Stagehand",
        timeIn1: found.timeIn1 || "",
        timeOut1: found.timeOut1 || "",
        lunchMinutes: String(found.lunchMinutes ?? 30),
        timeIn2: found.timeIn2 || "",
        timeOut2: found.timeOut2 || "",
        notes: found.notes || "",
      });
      setLoading(false);
    }
    load();
  }, [id]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { totalHours, stdHours, otHours, dtHours } = calcHours(
    form.timeIn1, form.timeOut1, form.timeIn2, form.timeOut2, Number(form.lunchMinutes) || 0
  );
  const stdRate = entry?.stdRate ?? 35;
  const otRate  = entry?.otRate  ?? 52.5;
  const dtRate  = entry?.dtRate  ?? 70;
  const totalPay = +(stdHours * stdRate + otHours * otRate + dtHours * dtRate).toFixed(2);
  const hasHours = totalHours > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateStaffTimesheet(id, {
        workDate: form.workDate,
        position: form.position,
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
            </div>
          )}

          <div className="grid">
            <div className="grid2">
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Work Date</label>
                <input type="date" value={form.workDate} onChange={set("workDate")} required />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "var(--muted)", display: "block", marginBottom: 4 }}>Position</label>
                <select value={form.position} onChange={set("position")}>
                  {positions.map((p) => <option key={p} value={p}>{p}</option>)}
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
