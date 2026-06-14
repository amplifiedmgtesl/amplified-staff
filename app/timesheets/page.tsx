"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getMyTimesheets, deleteStaffTimesheet, getProfile } from "@/lib/db";
import type { StaffTimesheet } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";

function statusBadge(t: StaffTimesheet) {
  // Admin-created entries: timesheetId set, no status → "On Record"
  if (!t.status && t.timesheetId) return <span className="badge badge-green">On Record</span>;
  if (!t.status) return <span className="badge">Pending</span>;
  // 'submitted' is the working state for both planned rows and worker entries.
  // staff_finalized is the real "I'm done" signal.
  if (t.status === "submitted" && !t.staffFinalized) return <span className="badge badge-blue">Enter your time</span>;
  if (t.status === "submitted" && t.staffFinalized) return <span className="badge badge-green">Final ✓ — pending approval</span>;
  if (t.status === "approved")  return <span className="badge badge-green">Approved</span>;
  if (t.status === "rejected")  return <span className="badge badge-red">Rejected</span>;
  return <span className="badge">{t.status}</span>;
}

export default function TimesheetsPage() {
  const router = useRouter();
  const [timesheets, setTimesheets] = useState<StaffTimesheet[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const profile = await getProfile(user.id);
    const ts = await getMyTimesheets(user.id, profile?.employeeKey ?? null);
    setTimesheets(ts);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this timesheet entry?")) return;
    await deleteStaffTimesheet(id);
    setTimesheets((prev) => prev.filter((t) => t.id !== id));
  }

  // Shifts that still need the worker's actual time: submitted (planned or own)
  // and not yet marked final. Most-recent day first.
  const needsTime = timesheets
    .filter((t) => t.status === "submitted" && !t.staffFinalized)
    .sort((a, b) => (b.workDate || "").localeCompare(a.workDate || ""));

  return (
    <AppShell title="My Timesheets" subtitle="All your submitted timesheet entries">
      {!loading && needsTime.length > 0 && (
        <div className="card" style={{ borderTopColor: "var(--gold)", marginBottom: 16 }}>
          <h2 className="section-title" style={{ margin: "0 0 12px" }}>
            ⏰ Shifts needing your time ({needsTime.length})
          </h2>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
            Enter your actual time, then check &ldquo;I&rsquo;m done&rdquo; so it can be approved.
          </p>
          <div className="grid">
            {needsTime.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.jobName || "—"}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t.workDate || "—"}{t.position ? ` · ${t.position}` : ""}
                  </div>
                </div>
                <button style={{ padding: "6px 14px", fontSize: 13, whiteSpace: "nowrap" }} onClick={() => router.push(`/timesheets/${t.id}/edit`)}>
                  Enter time
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="action-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <h2 className="section-title" style={{ margin: 0 }}>Timesheet History</h2>
          <Link href="/timesheets/new"><button>+ Submit New</button></Link>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : timesheets.length === 0 ? (
          <p className="muted">No timesheets yet. <Link href="/timesheets/new" style={{ color: "var(--gold-dark)" }}>Submit your first one.</Link></p>
        ) : (
          <div className="table-scroll"><table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Job / Event</th>
                <th>Position</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Lunch</th>
                <th>Std</th>
                <th>OT</th>
                <th>DT</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((t) => (
                <tr key={t.id}>
                  <td>{t.workDate || "—"}</td>
                  <td>{t.jobName || "—"}</td>
                  <td>{t.position || "—"}</td>
                  <td>{t.timeIn1 || "—"}{t.timeIn2 ? <div style={{ marginTop: 2 }}>{t.timeIn2}</div> : null}</td>
                  <td>{t.timeOut1 || "—"}{t.timeOut2 ? <div style={{ marginTop: 2 }}>{t.timeOut2}</div> : null}</td>
                  <td>{t.mealBreak1Minutes ? `${t.mealBreak1Minutes}m` : "—"}{(t.timeIn2 || t.timeOut2) ? <div style={{ marginTop: 2 }}>{t.mealBreak2Minutes ? `${t.mealBreak2Minutes}m` : "0m"}</div> : null}</td>
                  <td>{t.stdHours.toFixed(1)}</td>
                  <td>{t.otHours > 0 ? t.otHours.toFixed(1) : "—"}</td>
                  <td>{t.dtHours > 0 ? t.dtHours.toFixed(1) : "—"}</td>
                  <td><strong>{t.totalHours.toFixed(1)}</strong></td>
                  <td>{statusBadge(t)}</td>
                  <td>
                    <div className="action-row">
                      {t.status !== "approved" && t.status !== "rejected" && (
                        <button
                          className="secondary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => router.push(`/timesheets/${t.id}/edit`)}
                        >
                          Edit
                        </button>
                      )}
                      {/* Delete only own, unattached exception entries — never a
                          record that's on a job timesheet (timesheetId set). */}
                      {t.status === "submitted" && t.userId === userId && !t.timesheetId && (
                        <button
                          className="danger"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => handleDelete(t.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </AppShell>
  );
}
