"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { supabase } from "@/lib/supabase/client";
import { getProfile, getMyTimesheets, getMySchedule } from "@/lib/db";
import type { Profile, ScheduledJob, StaffTimesheet } from "@/lib/types";
import Link from "next/link";

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [timesheets, setTimesheets] = useState<StaffTimesheet[]>([]);
  const [upcoming, setUpcoming] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [p, ts] = await Promise.all([getProfile(user.id), getMyTimesheets(user.id)]);
      setProfile(p);
      setTimesheets(ts);
      const email = p?.email || user.email || "";
      if (email) {
        const jobs = await getMySchedule(email);
        setUpcoming(jobs.filter((j) => j.date >= today).slice(0, 3));
      }
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

          {upcoming.length > 0 && (
            <div className="card">
              <div className="action-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
                <h2 className="section-title" style={{ margin: 0 }}>Upcoming Jobs</h2>
                <Link href="/schedule" style={{ fontSize: 13, color: "var(--gold-dark)" }}>View all</Link>
              </div>
              <div className="grid">
                {upcoming.map((job) => (
                  <div key={job.jobSheetId} style={{ background: "var(--cream)", border: "1px solid var(--line)", borderLeft: "3px solid var(--gold)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{job.client}{job.eventName ? ` — ${job.eventName}` : ""}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{job.venue}{job.cityState ? `, ${job.cityState}` : ""}</div>
                    <div style={{ fontSize: 13, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <span>📅 {new Date(job.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                      {job.callTime && <span>⏰ {job.callTime}</span>}
                      {job.role && <span>🎭 {job.role}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="action-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <h2 className="section-title" style={{ margin: 0 }}>Recent Timesheets</h2>
              <Link href="/timesheets/new"><button>+ Submit Timesheet</button></Link>
            </div>
            {recent.length === 0 ? (
              <p className="muted">No timesheets submitted yet.</p>
            ) : (
              <div className="table-scroll"><table>
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
                      <td>{t.totalHours.toFixed(1)}</td>
                      <td>
                        <span className={`badge ${t.status === "approved" ? "badge-green" : t.status === "rejected" ? "badge-red" : "badge-blue"}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
