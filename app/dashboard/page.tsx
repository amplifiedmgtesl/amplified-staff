"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getProfile, getMyTimesheets } from "@/lib/db";
import type { Profile, StaffTimesheet } from "@/lib/types";
import Link from "next/link";

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [timesheets, setTimesheets] = useState<StaffTimesheet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [p, ts] = await Promise.all([getProfile(user.id), getMyTimesheets(user.id)]);
      setProfile(p);
      setTimesheets(ts);
      setLoading(false);
    }
    load();
  }, []);

  const recent = timesheets.slice(0, 5);
  const submitted = timesheets.filter((t) => t.status === "submitted").length;
  const approved = timesheets.filter((t) => t.status === "approved").length;

  return (
    <AppShell title="Dashboard" subtitle="Welcome to the Amplified Staff Portal">
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="grid">
          {!profile?.fullName && (
            <div className="card" style={{ borderTopColor: "#e05555" }}>
              <strong>Complete your profile</strong>
              <p className="muted" style={{ margin: "8px 0" }}>Please add your contact information so administrators can reach you.</p>
              <Link href="/profile"><button>Set up profile</button></Link>
            </div>
          )}

          <div className="grid3">
            <div className="metric-card">
              <div className="metric-label">Total Submitted</div>
              <div className="metric-value">{timesheets.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Pending Review</div>
              <div className="metric-value">{submitted}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Approved</div>
              <div className="metric-value">{approved}</div>
            </div>
          </div>

          <div className="card">
            <div className="action-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <h2 className="section-title" style={{ margin: 0 }}>Recent Timesheets</h2>
              <Link href="/timesheets/new"><button>+ Submit Timesheet</button></Link>
            </div>
            {recent.length === 0 ? (
              <p className="muted">No timesheets submitted yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Job</th>
                    <th>Position</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => (
                    <tr key={t.id}>
                      <td>{t.workDate}</td>
                      <td>{t.jobName || "—"}</td>
                      <td>{t.position || "—"}</td>
                      <td>{(t.regularHours + t.overtimeHours).toFixed(1)}</td>
                      <td>
                        <span className={`badge ${t.status === "approved" ? "badge-green" : t.status === "rejected" ? "badge-red" : "badge-blue"}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
