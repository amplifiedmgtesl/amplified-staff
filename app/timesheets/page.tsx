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
  if (t.status === "submitted") return <span className="badge badge-blue">Submitted</span>;
  if (t.status === "approved")  return <span className="badge badge-green">Approved</span>;
  if (t.status === "rejected")  return <span className="badge badge-red">Rejected</span>;
  return <span className="badge">{t.status}</span>;
}

export default function TimesheetsPage() {
  const router = useRouter();
  const [timesheets, setTimesheets] = useState<StaffTimesheet[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
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

  return (
    <AppShell title="My Timesheets" subtitle="All your submitted timesheet entries">
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
                  <td>{t.timeIn1 || "—"}</td>
                  <td>{t.timeOut1 || "—"}</td>
                  <td>{t.lunchMinutes ? `${t.lunchMinutes}m` : "—"}</td>
                  <td>{t.stdHours.toFixed(1)}</td>
                  <td>{t.otHours > 0 ? t.otHours.toFixed(1) : "—"}</td>
                  <td>{t.dtHours > 0 ? t.dtHours.toFixed(1) : "—"}</td>
                  <td><strong>{t.totalHours.toFixed(1)}</strong></td>
                  <td>{statusBadge(t)}</td>
                  <td>
                    <div className="action-row">
                      {t.status === "submitted" && (
                        <button
                          className="secondary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => router.push(`/timesheets/${t.id}/edit`)}
                        >
                          Edit
                        </button>
                      )}
                      {t.status === "submitted" && (
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
