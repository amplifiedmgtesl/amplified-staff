"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getMyTimesheets, deleteStaffTimesheet } from "@/lib/db";
import type { StaffTimesheet } from "@/lib/types";
import Link from "next/link";

export default function TimesheetsPage() {
  const [timesheets, setTimesheets] = useState<StaffTimesheet[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const ts = await getMyTimesheets(user.id);
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
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Job / Event</th>
                <th>Position</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Break</th>
                <th>Reg Hrs</th>
                <th>OT Hrs</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((t) => (
                <tr key={t.id}>
                  <td>{t.workDate}</td>
                  <td>{t.jobName || "—"}</td>
                  <td>{t.position || "—"}</td>
                  <td>{t.timeIn || "—"}</td>
                  <td>{t.timeOut || "—"}</td>
                  <td>{t.breakMinutes ? `${t.breakMinutes}m` : "—"}</td>
                  <td>{t.regularHours.toFixed(1)}</td>
                  <td>{t.overtimeHours > 0 ? t.overtimeHours.toFixed(1) : "—"}</td>
                  <td>
                    <span className={`badge ${t.status === "approved" ? "badge-green" : t.status === "rejected" ? "badge-red" : "badge-blue"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>
                    {t.status === "submitted" && (
                      <button className="danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => handleDelete(t.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
